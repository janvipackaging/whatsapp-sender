const fetch = require('node-fetch@2');

// This is the function our /api/send-message route will run
exports.sendMessage = async (req, res) => {
  try {
    // 1. Get the job data from the request body (sent by QStash)
    const { contact, templateName, companyToken, companyNumberId } = req.body;

    // 2. Build the WhatsApp API URL
    const WHATSAPP_API_URL = `https://graph.facebook.com/v19.0/${companyNumberId}/messages`;

    // 3. --- THIS IS THE FIX ---
    // We have REMOVED the 'components' block.
    // This will only work for templates with ZERO variables.
    
    const messageData = {
      messaging_product: "whatsapp",
      to: contact.phone,
      type: "template",
      template: {
        name: templateName,
        language: { code: "en_US" }
        // The 'components' section has been deleted.
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
      console.error('WhatsApp API Error:', result.error.message);
      return res.status(500).json({ success: false, error: result.error.message });
    }

    // 6. If it succeeds, log it and send a 200 status.
    console.log(`Message sent successfully to: ${contact.phone}`);
    res.status(200).json({ success: true, messageId: result.messages[0].id });

  } catch (error) {
    // Catch any other unexpected errors
    console.error('Server Error:', error.message);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
};