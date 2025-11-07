const fetch = require('node-fetch');

// This is the function our /api/send-message route will run
exports.sendMessage = async (req, res) => {
  try {
    // 1. Get the job data from the request body (sent by QStash)
    const { contact, templateName, companyToken, companyNumberId } = req.body;

    // 2. Build the WhatsApp API URL (Using v19.0, which is fine)
    const WHATSAPP_API_URL = `https://graph.facebook.com/v19.0/${companyNumberId}/messages`;

    // 3. --- THIS IS THE FINAL FIX ---
    // We are now sending the payload exactly as your
    // working PowerShell script does.
    
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
                // This is the variable *value* (e.g., "Uday" or "Rohan")
                text: contact.name || "friend", // Use contact's name, or "friend" as a backup
                
                // --- THIS IS THE NEW LINE ---
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
      // Log the *full* error
      console.error('WhatsApp API Error:', JSON.stringify(result.error, null, 2));
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