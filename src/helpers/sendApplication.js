const { sendEmailNotification } = require("../config/emailService");
const logger = require("../utils/logger");

async function sendApplicationReport(appliedJobs = []) {
  if (!Array.isArray(appliedJobs) || appliedJobs.length === 0) {
    console.log("No applied jobs found. Skipping email report.");
    return;
  }

  const appliedJobsHtml = appliedJobs
    .map(
      (job) => `
        <tr>
          <td>${job?.title || "N/A"}</td>
          <td>${job?.company || "N/A"}</td>
          <td>${job?.location || "N/A"}</td>
          <td><a href="${job?.applyInfo?.url || "#"}" target="_blank">${
        job?.applyInfo?.url || "N/A"
      }</a></td>
        </tr>
      `
    )
    .join("");

  const emailHtml = `
    <h2>Job Application Report</h2>
    <h3>Successfully Scraped Jobs (${appliedJobs.length})</h3>
    <table border="1" style="border-collapse: collapse; width: 100%;">
      <thead>
        <tr style="background-color: #f2f2f2;">
          <th style="padding: 8px;">Title</th>
          <th style="padding: 8px;">Company</th>
          <th style="padding: 8px;">Location</th>
          <th style="padding: 8px;">Company Site</th>
        </tr>
      </thead>
      <tbody>
        ${
          appliedJobsHtml ||
          '<tr><td colspan="4" style="text-align:center;">No jobs scraped with company link</td></tr>'
        }
      </tbody>
    </table>
  `;

  try {
    await sendEmailNotification(`LinkedIn Job Report`, emailHtml);
    console.log("Application report email sent successfully to", to);
  } catch (error) {
    console.error("Failed to send application report email:", error);
  }
}


module.exports = sendApplicationReport;
