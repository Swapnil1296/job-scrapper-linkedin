const XLSX = require("xlsx");
const fs = require("fs/promises");
const path = require("path");

function formatArrayForExcel(arr) {
  if (!Array.isArray(arr)) return arr;
  return arr.join(" | ");
}
async function saveToExcel(jobs) {
  try {
    const filesDir = path.join(__dirname, "files");
    await fs.mkdir(filesDir, { recursive: true });

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().split("T")[0];
    const filename = `linkedin_jobs_${timestamp}.xlsx`;
    const excelPath = path.join(filesDir, filename);

    // Clean and format job data
    const cleanJobs = jobs.map((job) => ({
      Title: job.title?.replace(/\s+/g, " ").trim() || "N/A",
      Company: job.company?.replace(/\s+/g, " ").trim() || "N/A",
      Location: job.location?.replace(/\s+/g, " ").trim() || "N/A",
      EasyApply: job.easyApply?.trim(),
      JobLink: job.jobLink?.trim() || "N/A",
      CompanyLink: job?.applyInfo?.url || "N/A",
    }));

    // Create new workbook and worksheet
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(cleanJobs);
    XLSX.utils.book_append_sheet(workbook, worksheet, "Jobs");

    // Write to file
    await XLSX.writeFile(workbook, excelPath);

    console.log("Saved jobs to ===>", excelPath);
    return excelPath;
  } catch (error) {
    console.error("Error saving to Excel:", error);
    throw error; // Re-throw to handle in the calling function
  }
}

module.exports = saveToExcel;
