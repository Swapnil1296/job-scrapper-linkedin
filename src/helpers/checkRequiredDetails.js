function filterJobTitle(jobTitle) {
  // Check for Developer or Engineer
  const hasDeveloperOrEngineer = /developer|engineer/i.test(jobTitle);

  // List of keywords to skip
  const skipKeywords = [
    // UI and Design
    "ui",
    "ui/ux",
    "ux",
    "design",
    "angular",
    "vue",
    "html",
    "junior",
    "Phalcon",
    "mulesoft",
    "oic",
    "aem",
    "golang",
    "blockchain",
    "qx",
    "koa",
    "middleware",
    "node",
    "ruby",
    "rails",
    "adobe",
    "core",
    "fusion",
    "power",
    "senior",
    "lucee",
    "coldfusion",
    "hybrid",
    "product",
    "devops",
    "solution",
    // Mobile and Platform-Specific
    "mobile",
    "android",
    "native",
    "ios",
    "mobile app",
    "mobile application",
    "android developer",
    "ios developer",
    "mobile dev",
    "apps",
    "flutter",

    // Backend and Enterprise Technologies
    ".net",
    "dotnet",
    "aspnet",
    "c#",
    "java",
    "j2ee",
    "enterprise",
    "backend",
    "server-side",

    // Web Technologies
    "wordpress",
    "laravel",
    "php",
    "drupal",
    "joomla",
    "content management",
    "cms developer",
    "rust",
    "python",

    // CRM and Specific Platforms
    "salesforce",
    "crm",
    "dynamics",
    "oracle",
    "sap",
    "enterprise resource planning",
    "erp",

    // Specific Domains
    "embedded",
    "hardware",
    "firmware",
    "game",
    "blockchain",
    "security",
    "network",
    "system",
    "cloud",
    "qa",
    "abinitio",
    "data",
  ];

  // Check for skip keywords
  const hasSkipKeyword = skipKeywords.some((keyword) =>
    jobTitle.toLowerCase().includes(keyword)
  );

  return {
    isValidTitle: hasDeveloperOrEngineer && !hasSkipKeyword,
  };
}
function checkFullstackRequirements(jobTitle, description, skillChips) {
  // Check for Fullstack Developer/Engineer
  const isFullstack = /fullstack\s*(developer|engineer)/i.test(jobTitle);

  // If Fullstack, check for Node.js
  if (isFullstack) {
    const nodeKeywords = ["node", "node.js", "nodejs", "backend"];

    const hasNodeKeyword = nodeKeywords.some(
      (keyword) =>
        description.toLowerCase().includes(keyword) ||
        skillChips.some((skill) => skill.toLowerCase().includes(keyword))
    );

    return {
      isValidFullstack: hasNodeKeyword,
    };
  }

  return { isValidFullstack: true };
}

async function checkRequiredSkills(page, job) {
  try {
    // check the title of the job
    const titleCheck = filterJobTitle(job.title);
    if (!titleCheck.isValidTitle) {
      console.log(`Job skipped due to title filter: ${job.title}`);
      return {
        isEligible: false,
        matchPercentage: 0,
        matchedSkills: [],
        skills: [],
        reason: "Invalid job title",
      };
    }
    // Get all skills from the job posting
    const jobInfo = await page.evaluate(() => {
      const skillChips = Array.from(
        document.querySelectorAll(".styles_chip__7YCfG")
      ).map((chip) => chip.textContent.toLowerCase().trim());

      const descriptionElement = document.querySelector(
        ".styles_JDC__dang-inner-html__h0K4t"
      );
      const description = descriptionElement
        ? descriptionElement.innerText.toLowerCase()
        : "";

      const applicantsElement = Array.from(
        document.querySelectorAll(".styles_jhc__stat__PgY67")
      ).find((el) => el.textContent.includes("Applicants:"));
      const openingsElement = Array.from(
        document.querySelectorAll(".styles_jhc__stat__PgY67")
      ).find((el) => el.textContent.includes("Openings:"));

      const applicantsCount = applicantsElement
        ? parseInt(
            applicantsElement
              .querySelector("span:last-child")
              .textContent.replace(/,/g, ""),
            10
          )
        : Infinity;

      const openingsCount = openingsElement
        ? parseInt(
            openingsElement
              .querySelector("span:last-child")
              .textContent.replace(/,/g, ""),
            10
          )
        : 1;

      return {
        skillChips,
        description,
        applicantsCount,
        openingsCount,
      };
    });
    // check it the title includes fullstack development
    const fullstackCheck = checkFullstackRequirements(
      job.title,
      jobInfo.description,
      jobInfo.skillChips
    );
    if (!fullstackCheck.isValidFullstack) {
      console.log(
        `Fullstack job skipped due to Node.js requirement: ${job.title}`
      );
      return {
        isEligible: false,
        matchPercentage: 0,
        matchedSkills: [],
        skills: [],
        reason: "Fullstack job lacks Node.js requirement",
      };
    }

    // Define your skills with variations and weightage
    const skillSets = [
      {
        name: "React",
        primary: ["react", "reactjs", "react.js"],
        related: ["javascript", "js", "frontend", "front-end", "front end"],
        weight: 5,
      },
      {
        name: "Next.js",
        primary: ["next", "nextjs", "next.js"],
        related: ["react", "javascript", "js"],
        weight: 4,
      },
      {
        name: "JavaScript",
        primary: ["javascript", "js", "ecmascript"],
        related: ["frontend", "web", "es6", "es2015"],
        weight: 4,
      },
      {
        name: "Redux",
        primary: ["redux", "redux toolkit", "rtk"],
        related: ["react", "state management"],
        weight: 3,
      },
      {
        name: "TypeScript",
        primary: ["typescript", "ts"],
        related: ["javascript", "type safety", "typed"],
        weight: 4,
      },
    ];

    // Helper function to check if any variation of a skill exists
    const hasSkill = (skillVariations, text) => {
      return skillVariations.some(
        (skill) =>
          text.includes(skill) ||
          text.includes(skill.replace(".", "")) ||
          text.includes(skill.replace("-", ""))
      );
    };

    // Calculate match score
    let totalScore = 0;
    let maxPossibleScore = 0;
    const matchedSkills = [];

    for (const skillSet of skillSets) {
      maxPossibleScore += skillSet.weight;

      const hasPrimarySkill =
        hasSkill(skillSet.primary, jobInfo.description) ||
        skillSet.primary.some((skill) =>
          jobInfo.skillChips.some((chip) => chip.includes(skill))
        );

      const hasRelatedSkill =
        hasSkill(skillSet.related, jobInfo.description) ||
        skillSet.related.some((skill) =>
          jobInfo.skillChips.some((chip) => chip.includes(skill))
        );

      if (hasPrimarySkill) {
        totalScore += skillSet.weight;
        matchedSkills.push(skillSet.name);
      } else if (hasRelatedSkill) {
        totalScore += skillSet.weight * 0.5;
        matchedSkills.push(`${skillSet.name} (related)`);
      }
    }

    // Calculate match percentage
    const matchPercentage = (totalScore / maxPossibleScore) * 100;

    //check if Early Applicant

    // Enhanced keyword combinations (triplets)
    const descriptionLower = jobInfo.description.toLowerCase();

    const keywordTriplets = [
      ["react", "javascript", "frontend"],
      ["react", "typescript", "frontend"],
      ["react", "redux", "javascript"],
      ["react", "next", "typescript"],
      ["react", "redux", "typescript"],
      ["frontend", "javascript", "typescript"],
      ["react", "frontend", "developer"],
      ["react", "ui", "developer"],
      ["typescript", "next", "frontend"],
      ["react", "api", "frontend"],
      ["react", "component", "development"],
      ["react", "web", "application"],
      ["frontend", "react", "experienced"],
    ];

    let bonusScore = 0;

    for (const [keyword1, keyword2, keyword3] of keywordTriplets) {
      if (
        descriptionLower.includes(keyword1) &&
        descriptionLower.includes(keyword2) &&
        descriptionLower.includes(keyword3)
      ) {
        bonusScore += 1.0; // Higher bonus for matching three keywords
        console.log(
          `Matched keyword triplet: ${keyword1} + ${keyword2} + ${keyword3}`
        );
      }
    }

    // Add bonus score to total
    totalScore += bonusScore;
    const finalMatchPercentage = Math.min(
      (totalScore / (maxPossibleScore + keywordTriplets.length)) * 100,
      100
    );
    // Calculate dynamic applicant limit based on openings ==> for 250 application for one job posting
    const applicantLimit = Math.max(350 * jobInfo.openingsCount, 100);
    const isEligible =
      finalMatchPercentage >= 45 &&
      (jobInfo.applicantsCount === undefined ||
        jobInfo.applicantsCount < applicantLimit);

    console.log("\n========><=========");
    console.log(`Match score: ${finalMatchPercentage.toFixed(1)}%`);
    console.log(`Matched skills: ${matchedSkills.join(", ")}`);
    console.log(`Applicants: ${jobInfo.applicantsCount}`);
    console.log(`Openings: ${jobInfo.openingsCount}`);
    console.log(`Applicant Limit: ${applicantLimit}`);
    console.log("\n========><=========");
    return {
      isEligible,
      matchPercentage: finalMatchPercentage,
      matchedSkills,
      skills: jobInfo.skillChips,
      score: {
        total: totalScore,
        max: maxPossibleScore,
        bonus: bonusScore,
      },
    };
  } catch (error) {
    console.error("Error in checkRequiredSkills:", error);
    return {
      isEligible: true,
      matchPercentage: 0,
      matchedSkills: [],
      skills: [],
      score: {
        total: 0,
        max: 0,
        bonus: 0,
      },
    };
  }
}

module.exports = { checkRequiredSkills, filterJobTitle };
