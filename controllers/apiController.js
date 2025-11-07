const fetch = require('node-fetch');
const Campaign = require('../models/Campaign');
const Message = require('../models/Message'); // <-- 1. IMPORT MESSAGE MODEL
const Company = require('../models/Company'); // <-- 2. IMPORT COMPANY MODEL
const Contact = require('../models/Contact'); // <-- 3. IMPORT CONTACT MODEL

// This is the function our /api/send-message route will run
exports.sendMessage = async (req, res) => {
  // (This function stays exactly the same as before)
  try {
    const { contact, templateName, companyToken, companyNumberId, campaignId } = req.body;
    const WHATSAPP_API_URL = `https://graph.facebook.com/v19.0/${companyNumberId}/messages`;

    const messageData = {
      messaging_product: "whatsapp",
      to: contact.phone,
      type: "template",
      template: {
        name: templateName,
        language: { code: "en_US" }
      }
    };

    const response = await fetch(WHATSAPP_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${companyToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(messageData)
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('WhatsApp API Error:', JSON.stringify(result.error, null, 2));
      if (campaignId) {
        await Campaign.findByIdAndUpdate(campaignId, { $inc: { failedCount: 1 } });
      }
      return res.status(500).json({ success: false, error: result.error.message });
    }

    console.log(`Message sent successfully to: ${contact.phone}`);
    if (campaignId) {
      // We count this as 'delivered' for now. The webhook will update 'read'.
      await Campaign.findByIdAndUpdate(campaignId, { $inc: { deliveredCount: 1 } });
    }

    res.status(200).json({ success: true, messageId: result.messages[0].id });

  } catch (error) {
    console.error('Server Error:', error.message);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};


// ---
// --- NEW WEBHOOK FUNCTIONS START HERE ---
// ---

// @desc    This function VERIFIES the webhook with Meta
exports.verifyWebhook = (req, res) => {
  console.log("Attempting to verify webhook...");

  // 1. Get the secret token from your Vercel Environment Variables
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  // 2. Get the data Meta is sending
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  // 3. Check if 'hub.mode' and 'hub.verify_token' exist
  if (mode && token) {
    // 4. Check if they are correct
    if (mode === "subscribe" && token === verifyToken) {
      // 5. Success! Send back the 'hub.challenge'
      console.log("WEBHOOK_VERIFIED");
      res.status(200).send(challenge);
    } else {
      // 6. Failed. Send 403 Forbidden
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

  // Check if it's a valid WhatsApp payload
  if (body.object === "whatsapp_business_account") {
    
    // Loop through each entry (there might be multiple)
    body.entry.forEach((entry) => {
      const change = entry.changes[0];
      const value = change.value;

      // --- HANDLE CUSTOMER REPLIES (INBOX) ---
      if (value.messages) {
        const message = value.messages[0];
        
        // Check if it's a 'text' message (a reply)
        if (message.type === "text") {
          console.log(`New reply from ${message.from}: ${message.text.body}`);
          // --- We will save this to our database ---
          saveIncomingMessage(value.metadata.phone_number_id, message);
        }
      }

      // --- HANDLE ANALYTICS (DELIVERED, READ) ---
      if (value.statuses) {
        const statusUpdate = value.statuses[0];
        
        // --- We will update our campaign stats ---
        updateCampaignStatus(statusUpdate);
      }
    });

    // Send a 200 OK to WhatsApp to say we received it
    res.status(200).send("EVENT_RECEIVED");

  } else {
    // Not a WhatsApp event, send 404
    res.sendStatus(404);
  }
};


// --- HELPER FUNCTIONS ---
// These functions do the actual database work

async function saveIncomingMessage(companyNumberId, message) {
  try {
    // 1. Find which company this message belongs to
    const company = await Company.findOne({ numberId: companyNumberId });
    if (!company) {
      console.log(`Cannot save message: No company found with ID ${companyNumberId}`);
      return;
    }

    // 2. Find which contact this message is from
    const contact = await Contact.findOne({ 
      phone: message.from,
      company: company._id 
    });
    if (!contact) {
      console.log(`Cannot save message: No contact found with phone ${message.from}`);
      return;
    }

    // 3. Save the new message to our 'messages' collection
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
    // We only care about 'delivered' and 'read'
    if (statusUpdate.status === 'delivered') {
      // For now, we are already updating 'delivered' when we send.
      // We could make this more accurate, but let's focus on 'read'.
    } else if (statusUpdate.status === 'read') {
      // This is the one we want!
      // This part is complex because WhatsApp *doesn't* send our campaignId back.
      // We would need to store the 'wamid' of *every* message we send.
      //
      // For now, let's just log it. We can build the 'read' count later.
      console.log(`Message ${statusUpdate.id} was read.`);
    }
  } catch (error) {
    console.error("Error updating campaign status:", error);
  }
}