const Message = require('../models/Message');
const Campaign = require('../models/Campaign');
const Contact = require('../models/Contact');
const fetch = require('node-fetch');

// @desc    Background worker that actually sends the WhatsApp message
// This must match the "Smart Logic" of the test sender
exports.sendMessageWorker = async (req, res) => {
  const { contact, templateName, companyToken, companyNumberId, campaignId, variableValue, variableName, apiVersion } = req.body;

  // 1. Use the Version that worked (v17.0)
  const version = apiVersion || "v17.0";
  const url = `https://graph.facebook.com/${version}/${companyNumberId}/messages`;

  // 2. Prepare the Smart Payload
  // We use the variableName passed from the controller (which we set to "name")
  const payload = {
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
              parameter_name: variableName || "name" // Matches the {{name}} in Meta
            }
          ]
        }
      ]
    }
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${companyToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (data.error) {
      console.error(`Meta API Error for ${contact.phone}:`, data.error.message);
      
      // Log failure in Database
      await Message.create({
        campaign: campaignId,
        contact: contact._id,
        status: 'failed',
        error: data.error.message,
        direction: 'outbound'
      });

      // Update Campaign Stats
      await Campaign.findByIdAndUpdate(campaignId, { $inc: { failedCount: 1 } });
      
      return res.status(400).json({ success: false, error: data.error.message });
    }

    // SUCCESS
    const messageId = data.messages[0].id;

    await Message.create({
      campaign: campaignId,
      contact: contact._id,
      whatsappId: messageId,
      status: 'sent',
      direction: 'outbound'
    });

    // Update Campaign Stats
    await Campaign.findByIdAndUpdate(campaignId, { $inc: { sentCount: 1 } });

    res.status(200).json({ success: true, messageId });

  } catch (error) {
    console.error('Worker Crash:', error);
    res.status(500).json({ success: false, error: 'Worker Internal Error' });
  }
};