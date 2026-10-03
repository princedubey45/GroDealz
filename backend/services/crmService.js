// Stub service for CRM Integration
exports.syncTicketToCRM = async (ticket) => {
  console.log(`[CRM Integration] Syncing ticket ${ticket._id} to Salesforce/Zendesk...`);
  // Mock API call to CRM
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve({ success: true, crmId: `CRM-${Math.floor(Math.random() * 10000)}` });
    }, 500);
  });
};
