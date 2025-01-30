// Function to construct the URL with given parameters and pagination
function constructSearchUrl(searchParams = {}, page = 1) {
  const {
    keywords = "",
    location = "",
    datePosted = "past24hours",
    experienceLevel = [],
    jobType = [],
    remote = false,
    sortBy = "R", // R for most relevant, DD for most recent
  } = searchParams;

  let searchUrl = `https://www.linkedin.com/jobs/search/`;

  // Create URLSearchParams to build the query string
  const params = new URLSearchParams();

  // Add keywords
  if (keywords) {
    params.append("keywords", keywords);
  }

  // Add location
  if (location) {
    params.append("location", location);
    // params.append('geoId', '102713980'); // You can add geoId if needed
  }

  // Add date filters (past24hours, pastWeek, etc.)
  const dateFilters = {
    past24hours: "r86400",
    pastWeek: "r604800",
    pastMonth: "r2592000",
  };
  if (datePosted && dateFilters[datePosted]) {
    params.append("f_TPR", dateFilters[datePosted]);
  }

  // Add experience filters
  const expFilters = {
    internship: "1",
    entry: "2",
    associate: "3",
    "mid-senior": "4",
    director: "5",
    executive: "6",
  };
  experienceLevel.forEach((level) => {
    if (expFilters[level]) {
      params.append("f_E", expFilters[level]);
    }
  });

  // Add job type filters (full-time, part-time, etc.)
  const typeFilters = {
    "full-time": "F",
    "part-time": "P",
    contract: "C",
    temporary: "T",
    internship: "I",
    volunteer: "V",
    other: "O",
  };
  jobType.forEach((type) => {
    if (typeFilters[type]) {
      params.append("f_JT", typeFilters[type]);
    }
  });

  // Add remote filter (f_WT)
  if (remote) {
    params.append("f_WT", "2"); // 2 represents remote jobs
  }

  // Add sorting parameter
  params.append("sortBy", sortBy);

  // Add origin parameter (helps with LinkedIn's tracking)
  params.append("origin", "JOB_SEARCH_PAGE_JOB_FILTER");

  // Add refresh parameter
  params.append("refresh", "true");

  // Add pagination parameter (start)
  const start = (page - 1) * 25; // LinkedIn lists 25 results per page
  params.append("start", start);

  // Construct the final URL with the query string
  searchUrl += `?${params.toString()}`;

  console.log("Constructed Search URL with pagination:", searchUrl);
  return searchUrl;
}

module.exports = constructSearchUrl;
