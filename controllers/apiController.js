const fetch = require('node-fetch');
const Campaign = require('../models/Campaign');
const Message = require('../models/Message');
const Company = require('../models/Company');
const Contact = require('../models/Contact');

/**
 * @desc    Background worker that actually sends the WhatsApp message
 * @route   POST /api/send-message
 */
exports.sendMessageWorker = async (req, res) => {
  try {
    // 1. Get the job data from the request body
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

    // --- 2. DUPLICATE CHECK (Safety Feature) ---
    // Check if this message was already successfully sent for this campaign
    if (campaignId && contact) {
      const existingMessage = await Message.findOne({
        contact: contact._id,
        campaign: campaignId
      }).lean();

      if (existingMessage && existingMessage.status !== 'failed') {
        console.log(`Duplicate job skipped: Contact ${contact.phone}`);
        return res.status(200).json({ success: true, message: "Duplicate skipped" });
      }
    }

    // --- 3. BUILD WHATSAPP API URL ---
    // Force v17.0 to match your working configuration
    const version = apiVersion || "v17.0";
    const WHATSAPP_API_URL = `https://graph.facebook.com/${version}/${companyNumberId}/messages`;

    // --- 4. BUILD THE SMART PAYLOAD ---
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
                // Matches the parameter name (e.g., 'name') in Meta Manager
                parameter_name: variableName || "name" 
              }
            ]
          }
        ]
      }
    };

    // --- 5. SEND TO WHATSAPP API ---
    const response = await fetch(WHATSAPP_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${companyToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(messageData)
    });

    const result = await response.json();

    // --- 6. HANDLE API ERRORS ---
    if (!response.ok) {
      console.error('Meta API Error:', JSON.stringify(result.error, null, 2));
      
      if (campaignId) {
        // Log the failure
        await Message.create({
          company: contact.company,
          contact: contact._id,
          campaign: campaignId,
          status: 'failed',
          body: `Meta Error: ${result.error?.message || 'Unknown rejection'}`,
          direction: 'outbound'
        });
        
        // Increment Failed count in Campaign
        await Campaign.findByIdAndUpdate(campaignId, { $inc: { failedCount: 1 } });
      }
      
      // Return 200 to QStash to acknowledge receipt and prevent infinite retries
      return res.status(200).json({ success: false, error: result.error?.message });
    }

    // --- 7. HANDLE SUCCESS ---
    const messageId = result.messages[0].id; // The 'wamid'
    console.log(`Successfully sent to: ${contact.phone}`);

    if (campaignId) {
      // Create the outbound message log
      const newMessage = new Message({
        contact: contact._id,
        campaign: campaignId,
        waMessageId: messageId,
        direction: 'outbound',
        status: 'sent',
        body: `Template: ${templateName}`
      });
      await newMessage.save();
      
      // Increment successful Sent count in Campaign
      await Campaign.findByIdAndUpdate(campaignId, { $inc: { sentCount: 1 } });
    }

    res.status(200).json({ success: true, messageId: messageId });

  } catch (error) {
    console.error('Worker Server Error:', error.message);
    res.status(500).json({ success: false, error: 'Internal Worker Error' });
  }
};


// --- WEBHOOK LOGIC: Verify Webhook ---
exports.verifyWebhook = (req, res) => {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token === verifyToken) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
};


// --- WEBHOOK LOGIC: Handle Events (Status Updates & Replies) ---
exports.handleWebhook = async (req, res) => {
  try {
    const body = req.body;
    if (body.object === "whatsapp_business_account") {
      if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value) {
        const value = body.entry[0].changes[0].value;

        // Case A: Status Updates (Sent -> Delivered -> Read)
        if (value.statuses && value.statuses.length > 0) {
          await updateCampaignStatus(value.statuses[0]);
        }

        // Case B: Incoming Messages (Replies)
        if (value.messages && value.messages.length > 0) {
          await saveIncomingMessage(value.metadata.phone_number_id, value.messages[0]);
        }
      }
      res.status(200).send("EVENT_RECEIVED");
    } else {
      res.sendStatus(404);
    }
  } catch (err) {
    console.error("Webhook Handler Error:", err.message);
    res.status(200).send("EVENT_RECEIVED"); // Meta expects 200
  }
};


// --- HELPER: Save Inbound Replies ---
async function saveIncomingMessage(phoneId, message) {
  try {
    const company = await Company.findOne({ numberId: phoneId });
    if (!company) return;

    const contact = await Contact.findOne({ phone: message.from, company: company._id });
    if (!contact) return;

    const existingMessage = await Message.findOne({ waMessageId: message.id });
    if (existingMessage) return;
    
    await Message.create({
      company: company._id,
      contact: contact._id,
      waMessageId: message.id,
      body: message.text?.body || "[Non-text message]",
      direction: 'inbound',
      isRead: false 
    });
    console.log(`New reply saved from ${message.from}`);
  } catch (error) {
    console.error("Error saving incoming message:", error);
  }
}


// --- HELPER: Real-time Analytics Tracking ---
async function updateCampaignStatus(statusUpdate) {
  try {
    const wamid = statusUpdate.id;
    const status = statusUpdate.status; 

    const message = await Message.findOne({ waMessageId: wamid });
    if (!message || !message.campaign) return;
    
    const oldStatus = message.status;

    // Status logic: Only update if the new status is a step forward
    if (oldStatus === 'sent' && (status === 'delivered' || status === 'read')) {
      message.status = status;
      await Campaign.findByIdAndUpdate(message.campaign, { $inc: { deliveredCount: 1 } });
    }

    if (oldStatus === 'delivered' && status === 'read') {
      message.status = status;
      await Campaign.findByIdAndUpdate(message.campaign, { $inc: { readCount: 1 } });
    }

    await message.save();
  } catch (error) {
    console.error("Error updating campaign status:", error);
  }
}