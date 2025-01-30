require("dotenv").config();
const saveToExcel = require("./src/helpers/saveJobToExcel");
const sendApplicationReport = require("./src/helpers/sendApplication");
const LinkedInJobScraper = require("./src/scraper/LinkedInJobScraper");

async function runJobSearch() {
  const scraper = new LinkedInJobScraper();
  const email = process.env.NAUKRI_USERNAME;
  const password = process.env.NAUKRI_PASSWORD;

  try {
    // Launch browser and login
    await scraper.launchBrowser();
    await scraper.login(email, password);

    // Define search parameters
    const searchParams = {
      keywords: "react js developer",
      location: "India",
      datePosted: "past24hours",
      experienceLevel: ["associate"],
      sortBy: "R",
      remote: false,
    };

    // Extract total jobs first
    const totalJobs = await scraper.getTotalJobs(searchParams);
    console.log("Total jobs found:", totalJobs.length);

    // Add delay after getting total jobs
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Scrape jobs after constructing the URL with pagination
    const jobs = await scraper.scrapeJobs(searchParams, totalJobs);

    // Add delay after scraping job listings
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Process jobs sequentially instead of in parallel
    const enrichedJobs = [];
    for (const job of jobs) {
      try {
        // Add delay between processing each job
        await new Promise((resolve) => setTimeout(resolve, 2000));

        console.log(
          `Processing job: ${job.title} out of ==${
            jobs.length
          }==> ${jobs.indexOf(job)}`
        );
        const enrichedJob = await scraper.processJob(job);
        if (
          enrichedJob.applyInfo?.type === "success" &&
          enrichedJob.applyInfo?.url
        ) {
          enrichedJobs.push(enrichedJob);
          console.log(`Added job: ${enrichedJob.title}`);
        } else {
          console.log(
            `Skipped job: ${enrichedJob.title} - ${
              enrichedJob.applyInfo?.message || "No apply info"
            }`
          );
        }

        // Add delay after processing each job
        await new Promise((resolve) => setTimeout(resolve, 2000));

        // Optionally clear browser cache and cookies periodically
        // if (enrichedJobs.length % 5 === 0) {
        //   const session = await scraper.page.target().createCDPSession();
        //   await session.send("Network.clearBrowserCache");
        //   await session.send("Network.clearBrowserCookies");
        //   await new Promise((resolve) => setTimeout(resolve, 1000));
        // }
      } catch (error) {
        console.error(`Error processing job ${job.title}:`, error);
        // Add the job with error information rather than skipping it
        enrichedJobs.push({
          ...job,
          applyInfo: {
            type: "error",
            url: null,
            message: `Failed to process job: ${error.message}`,
          },
        });
      }
    }

    // Optional: Save results to Excel with timestamp
    if (enrichedJobs.length > 0) {
      await sendApplicationReport(enrichedJobs);
    }
    await saveToExcel(enrichedJobs);
    console.log(`Total jobs processed: ${jobs.length}`);
    console.log(`Jobs with valid external URLs: ${enrichedJobs.length}`);
    console.log("Job search completed successfully!");
    return enrichedJobs;
  } catch (error) {
    console.error("Error during job search:", error);
    throw error;
  } finally {
    // Close the browser session
    await scraper.close();
  }
}

// Run the job search script
runJobSearch(); 
