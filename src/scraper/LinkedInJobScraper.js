const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");
const constructSearchUrl = require("./constructURL");
const { filterJobTitle } = require("../helpers/checkRequiredDetails");

function delay(time) {
  return new Promise((resolve) => setTimeout(resolve, time));
}

class LinkedInJobScraper {
  constructor() {
    this.browser = null;
    this.page = null;
    this.sessionFilePath = path.resolve(
      __dirname,
      process.env.SESSION_FILE || "./linkedin_session.json"
    );
    this.isLoggedIn = false;
  }
  async clearBrowserData() {
    try {
      const session = await this.page.target().createCDPSession();
      await session.send("Network.clearBrowserCache");
      await session.send("Network.clearBrowserCookies");
    } catch (error) {
      console.error("Error clearing browser data:", error);
    }
  }

  async resetPage() {
    try {
      await this.page.reload({ waitUntil: "networkidle0" });
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.error("Error resetting page:", error);
    }
  }

  async handleRateLimit() {
    console.log("Potential rate limit detected, waiting...");
    await new Promise((resolve) => setTimeout(resolve, 30000)); // 30 second wait
    await this.resetPage();
  }
  // Launch Puppeteer browser and check for saved session
  async launchBrowser() {
    this.browser = await puppeteer.launch({
      headless: false,
      defaultViewport: null,
      args: ["--start-maximized"],
      protocolTimeout: 30000, // Increase protocol timeout to 30 seconds
      timeout: 30000, // Increase overall timeout to 30 seconds
    });
    this.page = await this.browser.newPage();

    // Set default timeout for navigation
    await this.page.setDefaultNavigationTimeout(30000);
    // Set default timeout for other operations
    await this.page.setDefaultTimeout(30000);
    await this.page.setViewport({ width: 1000, height: 768 });
    return this.page;
  }

  // Get total jobs for the search parameters
  async getTotalJobs(searchParams) {
    const searchUrl = constructSearchUrl(searchParams, 1); // First page to extract total jobs
    await this.page.goto(searchUrl, { waitUntil: "domcontentloaded" });

    const totalJobsText = await this.page.evaluate(() => {
      const subtitleElement = document.querySelector(
        ".jobs-search-results-list__subtitle span"
      );

      // Extract the number (removing the " results" text)
      return subtitleElement
        ? subtitleElement.textContent.replace(" results", "")
        : "N/A";
    });

    return parseInt(totalJobsText.trim(), 10) || 0;
  }

  // Login to LinkedIn if not already logged in (via session)
  async login(email, password) {
    if (fs.existsSync(this.sessionFilePath)) {
      console.log("Session file found. Using existing session...");
      const sessionData = require(this.sessionFilePath);
      await this.page.setCookie(...sessionData.cookies);
      this.isLoggedIn = true;
      return;
    }

    console.log("Logging in to LinkedIn...");
    await this.page.goto("https://www.linkedin.com/login", {
      waitUntil: "domcontentloaded",
    });

    await this.page.type("#username", email);
    await this.page.type("#password", password);
    await this.page.click('button[type="submit"]');

    // Wait for the home page to load and ensure login was successful
    await this.page.waitForSelector(".global-nav__a11y-menu");

    this.isLoggedIn = true;

    // Save session data to file
    const cookies = await this.page.cookies();
    fs.writeFileSync(this.sessionFilePath, JSON.stringify({ cookies }));
    console.log("Session saved!");
  }

  // Scroll to the bottom of the page and wait for new content to load

  // Scrape jobs based on search parameters
  async scrapeJobs(searchParams = {}, totalJobs = 0) {
    const jobs = [];
    const jobsPerPage = 25;
    const totalPages = Math.max(Math.ceil(totalJobs / jobsPerPage), 1);

    console.log(
      `Total pages to scrape: ${totalPages} (Total Jobs: ${totalJobs})`
    );

    for (let page = 1; page <= totalPages; page++) {
      const searchUrl = constructSearchUrl(searchParams, page);

      await this.page.goto(searchUrl, { waitUntil: "domcontentloaded" });

      // Wait for the scrollable container
      await this.page.waitForSelector(
        ".scaffold-layout__list > div:not(.scaffold-layout__list-header)",
        {
          timeout: 60000,
        }
      );

      const getJobCount = async () => {
        return await this.page.evaluate(() => {
          const jobsList = document.querySelector(
            "[data-results-list-top-scroll-sentinel] + ul"
          );
          return jobsList ? jobsList.children.length : 0;
        });
      };

      console.log("Starting to scroll and collect jobs...");

      let noChangeCount = 0;
      const maxNoChangeCount = 2;
      let lastJobCount = 0;

      while (noChangeCount < maxNoChangeCount) {
        // Scroll the jobs container instead of the page
        await this.page.evaluate(() => {
          const jobsContainer = document.querySelector(
            "[data-results-list-top-scroll-sentinel] + ul"
          ).parentElement;
          if (jobsContainer) {
            const scrollStep = 300;
            const scrollInterval = setInterval(() => {
              jobsContainer.scrollTop += scrollStep;

              // If we've reached the bottom, clear the interval
              if (
                jobsContainer.scrollTop + jobsContainer.clientHeight >=
                jobsContainer.scrollHeight
              ) {
                clearInterval(scrollInterval);
              }
            }, 100);

            // Return a promise that resolves when scrolling is complete
            return new Promise((resolve) => {
              setTimeout(() => {
                clearInterval(scrollInterval);
                resolve();
              }, 2000);
            });
          }
        });

        // Wait for potential new content
        await delay(2000);

        // Check job count to determine if new content loaded
        const currentJobCount = await getJobCount();
        console.log(`Current job count: ${currentJobCount}`);

        if (currentJobCount === lastJobCount) {
          noChangeCount++;
          console.log(
            `No new jobs loaded. Attempt ${noChangeCount}/${maxNoChangeCount}`
          );
        } else {
          noChangeCount = 0;
          lastJobCount = currentJobCount;
          console.log(`New jobs loaded. Total jobs: ${currentJobCount}`);
        }
      }

      // Extract job data
      const jobElements = await this.page.evaluate(() => {
        const elements = document.querySelectorAll(
          ".scaffold-layout__list-item"
        );
        const jobsData = [];

        elements.forEach((element) => {
          try {
            const titleElement =
              element.querySelector(".job-card-list__title--link span") ||
              element.querySelector(".job-card-list__title--link");

            const title = titleElement?.textContent?.trim() || "N/A";
            const company =
              element
                .querySelector(".artdeco-entity-lockup__subtitle")
                ?.textContent?.trim() || "N/A";
            const location =
              element
                .querySelector(".job-card-container__metadata-wrapper")
                ?.textContent?.trim() || "N/A";
            const easyApply =
              element
                .querySelector(
                  ".job-card-container__footer-item > svg.job-card-list__icon ~ span"
                )
                ?.textContent.trim() === "Easy Apply"
                ? "Easy Apply"
                : "N/A";
            const jobLink =
              element.querySelector(".job-card-list__title--link")?.href ||
              "N/A";

            if (title !== "N/A") {
              jobsData.push({
                title,
                company,
                location,
                easyApply,
                jobLink,
              });
            }
          } catch (error) {
            console.error("Error extracting job data:", error);
          }
        });
        return jobsData;
      });
      const filteredJobs = jobElements.filter((job) => {
        const titleFilterResult = filterJobTitle(job.title);
        return titleFilterResult.isValidTitle;
      });

      jobs.push(...filteredJobs);
      console.log(
        `${filteredJobs.length} valid jobs found on page ${page} after title filtering`
      );
    }

    return jobs;
  }

  async handleApplyButton() {
    try {
      // Wait for job details to load
      await this.page.waitForSelector(".job-view-layout .jobs-details", {
        timeout: 20000,
      });

      // Store initial URL for comparison
      const initialUrl = await this.page.url();

      // Check for apply button with better selector coverage
      const applyButtonSelectors = [
        ".jobs-apply-button--top-card",
        'button[data-control-name="jobdetails_topcard_inapply"]',
        ".jobs-apply-button",
      ];

      let buttonHandle = null;
      for (const selector of applyButtonSelectors) {
        try {
          buttonHandle = await this.page.waitForSelector(selector, {
            timeout: 5000,
            visible: true,
          });
          if (buttonHandle) break;
        } catch (e) {
          continue;
        }
      }

      if (!buttonHandle) {
        return {
          type: "error",
          url: null,
          message: "Apply button not found",
        };
      }

      // Get button text
      const buttonText = await this.page.evaluate((button) => {
        return button.textContent.trim();
      }, buttonHandle);

      if (buttonText.toLowerCase().includes("easy apply")) {
        return {
          type: "info",
          url: null,
          message: "Easy Apply job",
        };
      }

      // Set up listeners for new pages and redirects
      const navigationPromise = this.page
        .waitForNavigation({
          timeout: 30000,
          waitUntil: "networkidle0",
        })
        .catch(() => null);

      const newPagePromise = new Promise((resolve) => {
        this.browser.once("targetcreated", async (target) => {
          const newPage = await target.page();
          resolve(newPage);
        });
      });

      // Click the apply button
      await buttonHandle.click({ delay: 100 });

      // Wait for either navigation or new page
      const [newPage] = await Promise.all([
        Promise.race([newPagePromise, navigationPromise]).catch(() => null),
        // Add small delay to ensure URL changes are captured
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);

      // Handle new page case
      if (newPage) {
        let externalUrl = null;
        let attempts = 0;
        const maxAttempts = 10;

        while (attempts < maxAttempts) {
          try {
            externalUrl = await newPage.url();

            // Check if URL is valid and external
            if (
              externalUrl &&
              externalUrl !== "about:blank" &&
              !externalUrl.includes("linkedin.com")
            ) {
              // Wait for page to stabilize
              await new Promise((resolve) => setTimeout(resolve, 2000));

              // Close the new page to prevent too many open tabs
              await newPage.close();

              return {
                type: "success",
                url: externalUrl,
                message: "External application URL captured",
              };
            }

            await new Promise((resolve) => setTimeout(resolve, 1000));
            attempts++;
          } catch (e) {
            attempts++;
          }
        }

        // Clean up if we couldn't get the URL
        if (newPage && !newPage.isClosed()) {
          await newPage.close();
        }
      }

      // Check current page URL as fallback
      const currentUrl = await this.page.url();
      if (currentUrl !== initialUrl && !currentUrl.includes("linkedin.com")) {
        return {
          type: "success",
          url: currentUrl,
          message: "External URL captured from current page",
        };
      }

      // Check page content for application URL
      const externalUrl = await this.page.evaluate(() => {
        const applyLink = document.querySelector(
          'a[data-tracking-control-name="public_jobs_apply-link-offsite_sign_up"]'
        );
        return applyLink ? applyLink.href : null;
      });

      if (externalUrl && !externalUrl.includes("linkedin.com")) {
        return {
          type: "success",
          url: externalUrl,
          message: "External URL found in page content",
        };
      }

      return {
        type: "error",
        url: null,
        message: "Could not capture external application URL",
      };
    } catch (error) {
      console.error("Error in handleApplyButton:", error);
      return {
        type: "error",
        url: null,
        message: error.message
      };
    }
  }

  async processJob(job) {
    try {
      // Navigate to job page
      await new Promise((resolve) => setTimeout(resolve, 2000));

      await this.page.goto(job.jobLink, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Handle the apply button and get result
      const applyResult = await this.handleApplyButton(this.page);

      // Return combined job info
      return {
        ...job,
        applyInfo: applyResult,
      };
    } catch (error) {
      console.error(`Error processing job ${job.title}:`, error);
      return {
        ...job,
        applyInfo: {
          type: "error",
          url: null,
          message: error.message,
        },
      };
    }
  }

  // Close the browser
  async close() {
    await this.browser.close();
  }
}

module.exports = LinkedInJobScraper;
