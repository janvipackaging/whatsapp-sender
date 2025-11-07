const fetch = require('node-fetch');

// This is the function our /api/send-message route will run
exports.sendMessage = async (req, res) => {
  try {
    // 1. Get the job data from the request body (sent by QStash)
    const { contact, templateName, companyToken, companyNumberId } = req.body;

    // 2. Build the WhatsApp API URL
    const WHATSAPP_API_URL = `https://graph.facebook.com/v19.0/${companyNumberId}/messages`;

    // 3. Build the message payload
    const messageData = {
      messaging_product: "whatsapp",
      to: contact.phone,
      type: "template",
      template: {
        name: templateName,
        language: { code: "en_US" }
        // Note: We are not including template variables here for simplicity.
        // We would need to add 'components' if your template has variables.
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
      // If it fails, log the error and send a 500 status.
      // QStash will see the 500 and *retry* the job automatically.
      console.error('WhatsApp API Error:', result.error.message);
      return res.status(500).json({ success: false, error: result.error.message });
    }

    // 6. If it succeeds, log it and send a 200 status.
    // QStash will see the 200 and mark the job as *complete*.
    console.log(`Message sent successfully to: ${contact.phone}`);
    res.status(200).json({ success: true, messageId: result.messages[0].id });

  } catch (error) {
    // Catch any other unexpected errors
    console.error('Server Error:', error.message);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};