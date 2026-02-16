const fetch = require('node-fetch');
const Campaign = require('../models/Campaign');
const Message = require('../models/Message');

exports.sendMessageWorker = async (req, res) => {
  // Helpful log for Vercel
  console.log(`[WORKER] Processing: ${req.body.contact?.phone}`);

  try {
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

    // 1. Duplicate Protection
    if (campaignId && contact._id) {
      const existing = await Message.findOne({ contact: contact._id, campaign: campaignId }).lean();
      if (existing && existing.status !== 'failed') {
        return res.status(200).json({ success: true, message: "Already sent" });
      }
    }

    // 2. Meta API Call
    const version = apiVersion || "v17.0";
    const url = `https://graph.facebook.com/${version}/${companyNumberId}/messages`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${companyToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: contact.phone,
        type: "template",
        template: {
          name: templateName,
          language: { code: "en_US" },
          components: [{
            type: "body",
            parameters: [{
              type: "text",
              text: variableValue || "Valued Customer",
              parameter_name: variableName || "name"
            }]
          }]
        }
      })
    });

    const result = await response.json();

    // 3. Handle Result
    if (response.ok) {
      const waId = result.messages?.[0]?.id;
      if (campaignId && waId) {
        // Update Stats & Log
        await Campaign.findByIdAndUpdate(campaignId, { $inc: { sentCount: 1, deliveredCount: 1 } });
        await Message.create({
          campaign: campaignId,
          contact: contact._id,
          waMessageId: waId,
          status: 'sent',
          direction: 'outbound',
          company: contact.company // Ensure company is linked
        });
      }
      return res.status(200).json({ success: true });
    } else {
      console.error("[META REJECTED]", result.error?.message);
      if (campaignId) {
          await Campaign.findByIdAndUpdate(campaignId, { $inc: { failedCount: 1 } });
      }
      return res.status(200).json({ success: false, error: result.error?.message });
    }
  } catch (error) {
    console.error("[WORKER CRASH]", error.message);
    // Return 500 to let QStash retry later if it was a temporary DB connection drop
    res.status(500).json({ success: false });
  }
};

exports.verifyWebhook = (req, res) => {
  if (req.query["hub.verify_token"] === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(req.query["hub.challenge"]);
  }
  res.sendStatus(403);
};

exports.handleWebhook = async (req, res) => {
  // Acknowledgement to Meta
  res.status(200).send("EVENT_RECEIVED");
};