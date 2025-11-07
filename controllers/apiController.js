const fetch = require('node-fetch'); // <-- Correct require
const Campaign = require('../models/Campaign');
const Message = require('../models/Message');
const Company = require('../models/Company');
const Contact = require('../models/Contact');

// This is the function our /api/send-message route will run
exports.sendMessage = async (req, res) => {
  try {
    // 1. Get the job data
    const { contact, templateName, companyToken, companyNumberId, campaignId } = req.body;

    // 2. Build the WhatsApp API URL
    const WHATSAPP_API_URL = `https://graph.facebook.com/v19.0/${companyNumberId}/messages`;

    // 3. --- THIS IS THE FINAL FIX ---
    // We are adding the 'components' block
    // to match your working PowerShell script.
    
    const messageData = {
      messaging_product: "whatsapp",
      to: contact.phone,
      type: "template",
      template: {
        name: templateName, // e.g., "welcome"
        language: { code: "en_US" },
        components: [
          {
            type: "body",
            parameters: [
              {
                type: "text",
                // This is the variable *value* (e.g., "Uday")
                text: contact.name || "friend", // Use contact's name, or "friend" as a backup
                
                // This is the variable *name*
                parameter_name: "customer_name" 
              }
            ]
          }
        ]
      }
    };
    // --- END OF FIX ---

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
      return res.status(500).json({ success: false, error: result.error.message });
    }

    // 6. If it succeeds, log it and send a 200 status.
    console.log(`Message sent successfully to: ${contact.phone}`);
    if (campaignId) {
      await Campaign.findByIdAndUpdate(campaignId, { $inc: { deliveredCount: 1 } });
    }
    res.status(200).json({ success: true, messageId: result.messages[0].id });

  } catch (error) {
    console.error('Server Error:', error.message);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};


// ---
// --- WEBHOOK FUNCTIONS (These are correct) ---
// ---

// @desc    This function VERIFIES the webhook with Meta
exports.verifyWebhook = (req, res) => {
  console.log("Attempting to verify webhook...");
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === verifyToken) {
      console.log("WEBHOOK_VERIFIED");
      res.status(200).send(challenge);
    } else {
      console.log("WEBHOOK_VERIFICATION_FAILED: Incorrect token");
      res.sendStatus(403);
    }
  } else {
    console.log("WEBHOOK_VERIFICATION_FAILED: Missing mode or token");
    res.sendStatus(403);
  }
};


// @desc    This function handles ALL incoming data from WhatsApp
exports.handleWebhook = async (req, res) => {
  const body = req.body;
  if (body.object === "whatsapp_business_account") {
    body.entry.forEach((entry) => {
      const change = entry.changes[0];
      const value = change.value;

      if (value.messages) {
        const message = value.messages[0];
        if (message.type === "text") {
          console.log(`New reply from ${message.from}: ${message.text.body}`);
          saveIncomingMessage(value.metadata.phone_number_id, message);
        }
      }
      if (value.statuses) {
        const statusUpdate = value.statuses[0];
        updateCampaignStatus(statusUpdate);
      }
    });
    res.status(200).send("EVENT_RECEIVED");
  } else {
    res.sendStatus(404);
  }
};


// --- HELPER FUNCTIONS ---
async function saveIncomingMessage(companyNumberId, message) {
  try {
    const company = await Company.findOne({ numberId: companyNumberId });
    if (!company) {
      console.log(`Cannot save message: No company found with ID ${companyNumberId}`);
      return;
    }
    const contact = await Contact.findOne({ 
      phone: message.from,
      company: company._id 
    });
    if (!contact) {
      console.log(`Cannot save message: No contact found with phone ${message.from}`);
      return;
    }
    const newMessage = new Message({
      company: company._id,
      contact: contact._id,
      waMessageId: message.id,
      body: message.text.body,
      direction: 'inbound'
    });
    await newMessage.save();
    console.log("Saved new inbound message to database.");

  } catch (error) {
    console.error("Error saving incoming message:", error);
  }
}

async function updateCampaignStatus(statusUpdate) {
  try {
    if (statusUpdate.status === 'read') {
      console.log(`Message ${statusUpdate.id} was read.`);
    }
  } catch (error) {
    console.error("Error updating campaign status:", error);
  }
}