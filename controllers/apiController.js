const fetch = require('node-fetch');
const Campaign = require('../models/Campaign');
const Message = require('../models/Message');
const Company = require('../models/Company');
const Contact = require('../models/Contact');

// @desc    This is the function our /api/send-message route will run
exports.sendMessage = async (req, res) => {
  try {
    // 1. Get the job data
    const { contact, templateName, companyToken, companyNumberId, campaignId } = req.body;

    // 2. Build the WhatsApp API URL
    const WHATSAPP_API_URL = `https://graph.facebook.com/v19.0/${companyNumberId}/messages`;

    // 3. Build the message payload
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
                text: contact.name || "friend",
                parameter_name: "customer_name" 
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
      return res.status(500).json({ success: false, error: result.error.message });
    }

    // 6. If it succeeds, log it.
    const messageId = result.messages[0].id; // This is the 'wamid'
    console.log(`Message sent successfully to: ${contact.phone} (wamid: ${messageId})`);

    // --- 7. NEW: SAVE OUTBOUND MESSAGE ---
    // This is the CRITICAL step for tracking 'read' status
    if (campaignId) {
      const newMessage = new Message({
        company: companyToken.company, // Assuming companyId is passed
        contact: contact._id,
        campaign: campaignId,
        waMessageId: messageId,
        direction: 'outbound',
        status: 'sent' // The webhook will update this to 'delivered' and 'read'
      });
      await newMessage.save();
    }
    // --- END OF NEW CODE ---

    res.status(200).json({ success: true, messageId: messageId });

  } catch (error) {
    console.error('Server Error:', error.message);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};


// ---
// --- WEBHOOK FUNCTIONS ---
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
  try {
    const body = req.body;
    if (body.object === "whatsapp_business_account") {
      
      const entry = body.entry[0];
      if (entry.changes) {
        const change = entry.changes[0];
        const value = change.value;

        // --- HANDLE CUSTOMER REPLIES (INBOX) ---
        if (value.messages) {
          const message = value.messages[0];
          if (message.type === "text") {
            console.log(`New reply from ${message.from}: ${message.text.body}`);
            saveIncomingMessage(value.metadata.phone_number_id, message);
          }
        }

        // --- HANDLE ANALYTICS (DELIVERED, READ) ---
        if (value.statuses) {
          const statusUpdate = value.statuses[0];
          updateCampaignStatus(statusUpdate);
        }
      }

      // Send a 200 OK to WhatsApp to say we received it
      res.status(200).send("EVENT_RECEIVED");

    } else {
      // Not a WhatsApp event, send 404
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
    // Avoid saving duplicate replies
    const existingMessage = await Message.findOne({ waMessageId: message.id });
    if (existingMessage) {
      console.log("Duplicate inbound message ignored.");
      return;
    }
    
    const newMessage = new Message({
      company: company._id,
      contact: contact._id,
      waMessageId: message.id,
      body: message.text.body,
      direction: 'inbound',
      isRead: false // Mark as unread for the inbox
    });
    await newMessage.save();
    console.log("Saved new inbound message to database.");

  } catch (error) {
    console.error("Error saving incoming message:", error);
  }
}

// @desc    This function is now UPDATED to track Read Rate
async function updateCampaignStatus(statusUpdate) {
  try {
    const wamid = statusUpdate.id; // The ID of the message
    const status = statusUpdate.status; // 'delivered' or 'read'

    // 1. Find the message in our database
    const message = await Message.findOne({ waMessageId: wamid });
    if (!message) {
      // Not a message we are tracking (e.g., from a different app)
      return;
    }
    
    // 2. Update the message's own status
    message.status = status;
    await message.save();

    // 3. --- THIS IS THE ANALYTICS ---
    // If the message is part of a campaign AND it was just marked as 'read'
    if (status === 'read' && message.campaign) {
      
      // Increment the 'readCount' for that campaign
      await Campaign.findByIdAndUpdate(message.campaign, { 
        $inc: { readCount: 1 } 
      });
      
      console.log(`Campaign ${message.campaign} was READ.`);
    }
    
    // We can also update 'deliveredCount' here for more accuracy
    if (status === 'delivered' && message.campaign) {
       await Campaign.findByIdAndUpdate(message.campaign, { 
        $inc: { deliveredCount: 1 } 
      });
    }
    // --- END OF ANALYTICS ---

  } catch (error) {
    console.error("Error updating campaign status:", error);
  }
}