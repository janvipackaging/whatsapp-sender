const fetch = require('node-fetch');
const Campaign = require('../models/Campaign');
const Message = require('../models/Message');
const Company = require('../models/Company');
const Contact = require('../models/Contact');

/**
 * @desc    Background worker that actually sends the WhatsApp message
 * @route   POST /api/send-message (Public Route)
 */
exports.sendMessageWorker = async (req, res) => {
  try {
    // 1. Get the job data sent from campaignsController
    const { 
      contact, 
      templateName, 
      companyToken, 
      companyNumberId, 
      campaignId, 
      variableValue, 
      variableName, 
      apiVersion 
    } = req.body;

    // --- 2. DUPLICATE CHECK (Your Safety Lock) ---
    // If a message was already recorded for this contact in this campaign, stop.
    if (campaignId && contact) {
      const existingMessage = await Message.findOne({
        contact: contact._id,
        campaign: campaignId
      }).lean();

      if (existingMessage && existingMessage.status !== 'failed') {
        console.log(`Duplicate detected for ${contact.phone}. Skipping.`);
        return res.status(200).json({ success: true, message: "Duplicate skipped" });
      }
    }

    // --- 3. BUILD API URL ---
    // Forces the version (v17.0) passed by the campaign controller
    const version = apiVersion || "v17.0";
    const WHATSAPP_API_URL = `https://graph.facebook.com/${version}/${companyNumberId}/messages`;

    // --- 4. CONSTRUCT THE SMART PAYLOAD ---
    const messageData = {
      messaging_product: "whatsapp",
      to: contact.phone,
      type: "template",
      template: {
        name: templateName,
        language: { code: "en_US" },
        components: [
          {
            type: "body",
            parameters: [
              {
                type: "text",
                text: variableValue || "Valued Customer",
                // Matches the parameter name required by your template (e.g., 'name')
                parameter_name: variableName || "name" 
              }
            ]
          }
        ]
      }
    };

    // --- 5. EXECUTE SEND ---
    const response = await fetch(WHATSAPP_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${companyToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(messageData)
    });

    const result = await response.json();

    // --- 6. HANDLE FAILURES ---
    if (!response.ok) {
      console.error(`Meta API Rejection for ${contact.phone}:`, result.error?.message);
      
      if (campaignId) {
        // Log the failed attempt in the messages collection
        await Message.create({
          company: contact.company,
          contact: contact._id,
          campaign: campaignId,
          status: 'failed',
          direction: 'outbound',
          body: `Meta Error: ${result.error?.message || 'Rejected'}`
        });
        
        // Update the Campaign Failed Count
        await Campaign.findByIdAndUpdate(campaignId, { $inc: { failedCount: 1 } });
      }
      
      // Return 200 to acknowledge the job so the worker doesn't retry invalid data
      return res.status(200).json({ success: false, error: result.error?.message });
    }

    // --- 7. HANDLE SUCCESS ---
    const messageId = result.messages[0].id; // The 'wamid'

    if (campaignId) {
      // Create the outbound message log
      await Message.create({
        company: contact.company,
        contact: contact._id,
        campaign: campaignId,
        waMessageId: messageId,
        status: 'sent',
        direction: 'outbound',
        body: `Template: ${templateName}`
      });
      
      // Update Campaign Stats (Immediate feedback)
      // Note: We increment deliveredCount here as 'sent' from Meta usually implies delivery to server
      await Campaign.findByIdAndUpdate(campaignId, { 
        $inc: { sentCount: 1, deliveredCount: 1 } 
      });
    }

    res.status(200).json({ success: true, messageId });

  } catch (error) {
    console.error('Worker Server Error:', error.message);
    res.status(500).json({ success: false, error: 'Internal Worker Error' });
  }
};

/**
 * @desc    Verify Webhook for Meta Integration
 */
exports.verifyWebhook = (req, res) => {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === verifyToken) {
    res.status(200).send(req.query["hub.challenge"]);
  } else {
    res.sendStatus(403);
  }
};

/**
 * @desc    Handle incoming Webhook events (Status Updates & Replies)
 */
exports.handleWebhook = async (req, res) => {
  try {
    const body = req.body;
    if (body.object === "whatsapp_business_account") {
      const entry = body.entry?.[0];
      const change = entry?.changes?.[0];
      const value = change?.value;

      // --- Case 1: Tracking (Delivered/Read) ---
      if (value?.statuses && value.statuses.length > 0) {
        const statusUpdate = value.statuses[0];
        const wamid = statusUpdate.id;
        const newStatus = statusUpdate.status;

        const message = await Message.findOne({ waMessageId: wamid });
        if (message && message.campaign) {
          // If message is read, update the campaign report
          if (newStatus === 'read' && message.status !== 'read') {
            message.status = 'read';
            await message.save();
            await Campaign.findByIdAndUpdate(message.campaign, { $inc: { readCount: 1 } });
          }
        }
      }

      // --- Case 2: Inbound Replies ---
      if (value?.messages && value.messages.length > 0) {
        const message = value.messages[0];
        const company = await Company.findOne({ numberId: value.metadata.phone_number_id });
        if (company) {
          const contact = await Contact.findOne({ phone: message.from, company: company._id });
          if (contact) {
            await Message.create({
              company: company._id,
              contact: contact._id,
              waMessageId: message.id,
              body: message.text?.body || "[Non-text message]",
              direction: 'inbound',
              isRead: false
            });
          }
        }
      }
      res.status(200).send("EVENT_RECEIVED");
    } else {
      res.sendStatus(404);
    }
  } catch (err) {
    console.error("Webhook Error:", err.message);
    res.status(200).send("EVENT_RECEIVED");
  }
};