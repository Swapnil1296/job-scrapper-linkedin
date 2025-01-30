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
    const totalPages = Math.min(Math.ceil(totalJobs / jobsPerPage), 1);

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
      // Add a longer timeout for slow connections
      await this.page.waitForSelector(".job-view-layout .jobs-details", {
        timeout: 15000,
      });

      // Get initial pages before clicking
      const pagesBefore = await this.page.browser().pages();

      // Check and get apply button text with retry logic
      let buttonText = null;
      for (let i = 0; i < 3; i++) {
        try {
          // Use evaluateHandle instead of evaluate for better stability
          const buttonHandle = await this.page.waitForSelector(
            ".jobs-apply-button--top-card",
            {
              timeout: 10000,
            }
          );

          if (buttonHandle) {
            buttonText = await this.page.evaluate(
              (button) => button.textContent.trim(),
              buttonHandle
            );
            await buttonHandle.dispose(); // Clean up the handle
          }

          if (buttonText) break;
          await new Promise((resolve) => setTimeout(resolve, 2000)); // Increased wait between retries
        } catch (e) {
          console.log(`Attempt ${i + 1} to get button text failed:`, e);
        }
      }

      if (!buttonText) {
        return {
          type: "error",
          url: null,
          message: "Apply button not found after retries",
        };
      }

      console.log("Button text:", buttonText);

      if (buttonText.toLowerCase().includes("easy apply")) {
        return {
          type: "info",
          url: null,
          message: "This is an Easy Apply job - skipping external application",
        };
      }

      if (buttonText.includes("Apply")) {
        // Set up new page listener before clicking
        const newPagePromise = new Promise((resolve) => {
          this.page.browser().once("targetcreated", async (target) => {
            const newPage = await target.page();
            resolve(newPage);
          });
        });

        // Enhanced click with retry logic and proper handle management
        let clickSuccess = false;
        for (let i = 0; i < 3; i++) {
          try {
            // Get a fresh handle for each attempt
            const buttonHandle = await this.page.waitForSelector(
              ".jobs-apply-button--top-card",
              {
                timeout: 10000,
              }
            );

            if (buttonHandle) {
              // Ensure button is visible and clickable
              await this.page.evaluate((button) => {
                if (button.offsetParent !== null) {
                  button.scrollIntoView({
                    behavior: "smooth",
                    block: "center",
                  });
                }
              }, buttonHandle);

              // Wait for any animations to complete
              await new Promise((resolve) => setTimeout(resolve, 1000));

              // Try different click methods
              try {
                await buttonHandle.click({ delay: 100 }); // Add slight delay to click
              } catch (clickError) {
                // Fallback to evaluate click if direct click fails
                await this.page.evaluate(
                  (button) => button.click(),
                  buttonHandle
                );
              }

              clickSuccess = true;
              await buttonHandle.dispose(); // Clean up the handle
              break;
            }
          } catch (e) {
            console.log(`Attempt ${i + 1} to click button failed:`, e);
            await new Promise((resolve) => setTimeout(resolve, 2000)); // Increased wait between retries
          }
        }

        if (!clickSuccess) {
          return {
            type: "error",
            url: null,
            message: "Failed to click apply button after retries",
          };
        }

        try {
          // Wait for new page with increased timeout
          const newPage = await Promise.race([
            newPagePromise,
            new Promise(
              (_, reject) =>
                setTimeout(() => reject(new Error("New page timeout")), 15000) // Increased timeout
            ),
          ]);

          if (newPage) {
            // Wait for the page to have a valid URL
            let url = null;
            let attempts = 0;
            const maxAttempts = 15;

            while (attempts < maxAttempts) {
              try {
                url = await newPage.url();

                if (
                  url &&
                  url !== "about:blank" &&
                  !url.includes("linkedin.com")
                ) {
                  // Wait for page to stabilize
                  await new Promise((resolve) => setTimeout(resolve, 2000));

                  return {
                    type: "success",
                    url: url,
                    message: "Successfully captured external application URL",
                  };
                }

                await new Promise((resolve) => setTimeout(resolve, 2000));
                attempts++;
              } catch (e) {
                console.log(`URL fetch attempt ${attempts + 1} failed:`, e);
                attempts++;
              }
            }
          }
        } catch (error) {
          console.log("Error waiting for new page:", error);
        }

        // Enhanced fallback with retry
        for (let i = 0; i < 3; i++) {
          try {
            const currentUrl = await this.page.url();
            if (currentUrl && currentUrl !== pagesBefore[0].url()) {
              return {
                type: "success",
                url: currentUrl,
                message: "Successfully captured URL from current page",
              };
            }
            await new Promise((resolve) => setTimeout(resolve, 2000));
          } catch (e) {
            console.log(`Fallback URL check attempt ${i + 1} failed:`, e);
          }
        }
      }

      return {
        type: "error",
        url: null,
        message: "Could not capture application URL after all attempts",
      };
    } catch (error) {
      console.error("Error in handleApplyButton:", error);
      return {
        type: "error",
        url: null,
        message: error.message,
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
