const fetch = require('node-fetch');
const Campaign = require('../models/Campaign');
const Message = require('../models/Message');
const Company = require('../models/Company');
const Contact = require('../models/Contact');

// @desc    Background worker that actually sends the WhatsApp message
// UPDATED: Now uses v17.0 and Named Parameters to match your working script
exports.sendMessageWorker = async (req, res) => {
  try {
    // 1. Get the job data
    // We now accept 'variableName' and 'apiVersion' from the campaign controller
    const { contact, templateName, companyToken, companyNumberId, campaignId, variableValue, variableName, apiVersion } = req.body;

    // --- DUPLICATE CHECK ---
    // Check if this message has already been sent for this campaign
    if (campaignId && contact) {
        const existingMessage = await Message.findOne({
            contact: contact._id,
            campaign: campaignId
        });
        
        if (existingMessage) {
            console.log(`Duplicate job skipped: Contact ${contact.phone}`);
            return res.status(200).json({ success: true, message: "Duplicate skipped" });
        }
    }

    // 2. Build the WhatsApp API URL
    // FIX: Force v17.0 (or whatever was passed) to match the working PowerShell script
    const version = apiVersion || "v17.0";
    const WHATSAPP_API_URL = `https://graph.facebook.com/${version}/${companyNumberId}/messages`;

    // 3. Build the Smart Payload
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
                text: variableValue || "Customer",
                // FIX: Use the specific parameter name (e.g. 'name') required by your template
                parameter_name: variableName || "name" 
              }
            ]
          }
        ]
      }
    };

    // 4. Send the message to the WhatsApp API
    const response = await fetch(WHATSAPP_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${companyToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(messageData)
    });

    const result = await response.json();

    // 5. Check if the message send was successful
    if (!response.ok) {
      console.error('WhatsApp API Error:', JSON.stringify(result.error, null, 2));
      if (campaignId) {
        await Campaign.findByIdAndUpdate(campaignId, { $inc: { failedCount: 1 } });
      }
      // Return 200 to QStash even on Meta error to prevent infinite retries of bad data
      return res.status(200).json({ success: false, error: result.error.message });
    }

    // 6. Success
    const messageId = result.messages[0].id;
    console.log(`Message sent successfully to: ${contact.phone}`);

    // 7. Save Outbound Message Log
    if (campaignId) {
      const company = await Company.findOne({ numberId: companyNumberId });
      
      const newMessage = new Message({
        company: company ? company._id : null,
        contact: contact._id,
        campaign: campaignId,
        waMessageId: messageId,
        direction: 'outbound',
        status: 'sent',
        body: `Template: ${templateName}`
      });
      await newMessage.save();
      
      // Update Campaign Stats (Increment Sent Count)
      await Campaign.findByIdAndUpdate(campaignId, { $inc: { sentCount: 1 } });
    }

    res.status(200).json({ success: true, messageId: messageId });

  } catch (error) {
    console.error('Worker Server Error:', error.message);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};


// ---
// --- WEBHOOK FUNCTIONS (Preserved) ---
// ---

// @desc    Verify Webhook
exports.verifyWebhook = (req, res) => {
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === verifyToken) {
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  } else {
    res.sendStatus(403);
  }
};


// @desc    Handle Incoming Data
exports.handleWebhook = async (req, res) => {
  try {
    const body = req.body;
    if (body.object === "whatsapp_business_account") {
      if (body.entry && body.entry.length > 0) {
        body.entry.forEach((entry) => {
          if (entry.changes && entry.changes.length > 0) {
            const change = entry.changes[0];
            if (change.value) {
              const value = change.value;

              if (value.messages) {
                const message = value.messages[0];
                if (message.type === "text") {
                  saveIncomingMessage(value.metadata.phone_number_id, message);
                }
              }

              if (value.statuses) {
                const statusUpdate = value.statuses[0];
                updateCampaignStatus(statusUpdate);
              }
            }
          }
        });
      }
      res.status(200).send("EVENT_RECEIVED");
    } else {
      res.sendStatus(404);
    }
  } catch (err) {
    console.error("Error in handleWebhook:", err.message);
    res.status(500).send("Internal Server Error");
  }
};


// --- HELPER FUNCTIONS ---

async function saveIncomingMessage(companyNumberId, message) {
  try {
    const company = await Company.findOne({ numberId: companyNumberId });
    if (!company) return;

    const contact = await Contact.findOne({ phone: message.from, company: company._id });
    if (!contact) return;

    const existingMessage = await Message.findOne({ waMessageId: message.id });
    if (existingMessage) return;
    
    const newMessage = new Message({
      company: company._id,
      contact: contact._id,
      waMessageId: message.id,
      body: message.text.body,
      direction: 'inbound',
      isRead: false 
    });
    await newMessage.save();

  } catch (error) {
    console.error("Error saving incoming message:", error);
  }
}

async function updateCampaignStatus(statusUpdate) {
  try {
    const wamid = statusUpdate.id;
    const status = statusUpdate.status; 

    // 1. Find message
    const message = await Message.findOne({ waMessageId: wamid });
    if (!message) return;
    
    const oldStatus = message.status;

    // 2. Update message status
    if (oldStatus === 'sent' && (status === 'delivered' || status === 'read')) {
      message.status = status;
    }
    if (oldStatus === 'delivered' && status === 'read') {
      message.status = status;
    }
    
    // 3. Update Campaign Analytics
    if (message.campaign) {
        if (status === 'delivered' && oldStatus === 'sent') {
            await Campaign.findByIdAndUpdate(message.campaign, { $inc: { deliveredCount: 1 } });
        }
        
        if (status === 'read' && oldStatus !== 'read') {
            await Campaign.findByIdAndUpdate(message.campaign, { $inc: { readCount: 1 } });
            
            // Implicit delivery if read happens fast
            if (oldStatus === 'sent') {
              await Campaign.findByIdAndUpdate(message.campaign, { $inc: { deliveredCount: 1 } });
            }
        }
    }

    await message.save();

  } catch (error) {
    console.error("Error updating campaign status:", error);
  }
}