require("dotenv").config();
const express = require("express");
const app = express();
const { Octokit } = require("@octokit/core");
const session = require("express-session");
const parseurl = require("parse-url");
const octokit = new Octokit({ auth: process.env.TOKEN });
const octoberChecker = require("./utils/octoberChecker");
app.use(
  session({ secret: "mySecret", resave: false, saveUninitialized: false })
);
// parse application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: false }));
// parse application/json
app.use(express.json());
app.set("view engine", "ejs");
app.use(express.static(__dirname + "/public"));

// Endpoints

// GET METHODS
// app.get("/", async (req, res) => {
//   console.log(app.get("context"))
//   if (octoberChecker.isNotOctober()) {
//     res.render("index", { show: "idle" });
//   } else if (app.get("context") == "success") {
//     // req.session.context=="idle"
//     res.render("index", { show: "success" });
//     app.set("context", "idle");
//   } else if (app.get("context") == "failed") {
//     res.render("index", { show: "failed" });
//     app.set("context", "idle");
//   } else if (app.get("context") == "pr-accepted") {
//     res.render("index", { show: "pr-accepted" });
//     app.set("context", "idle");
//   } else if (app.get("context") == "pr-open") {
//     res.render("index", { show: "pr-open" });
//     app.set("context", "idle");
//   } else {
//     res.render("index", { show: "idle" });
//     app.set("context", "idle");
//   }
// });
app.get("/", (req, res) => {
  // if(octoberChecker.isNotOctober()) {
  //   res.render("not-october")
  //   return
  // }
  res.render("index");
});

// Methods
function getRepositoryDetailsObject(URL) {
  const owner = parseurl(URL).pathname.split("/")[1];
  const repository = parseurl(URL).pathname.split("/")[2];
  const isPrUrl = parseurl(URL).pathname.includes("pull");
  const repoObj = {
    owner: owner,
    repository: repository,
    isPrUrl: isPrUrl,
    URL: URL,
  };
  return JSON.stringify(repoObj);
}
function checkEligibilityForHacktoberfest(response) {
  // Getting All Labels from Response
  const labels = response.data.labels;
  let isHacktoberFestPr = false;
  // Searching for hacktoberfest labels
  labels.forEach((label) => {
    if (
      label.name == "hacktoberfest" ||
      label.name == "hacktoberfest-accepted"
    ) {
      isHacktoberFestPr = true;
    }
  });
  if (isHacktoberFestPr) {
    if (response.data.state === "closed") {
      return JSON.stringify({
        status: 200,
        isOpen: false,
        isEligible: true,
        valid: true,
      });
    } else {
      return JSON.stringify({
        status: 200,
        isOpen: true,
        isEligible: true,
        valid: true,
      });
    }
  } else {
    return JSON.stringify({
      status: 200,
      isOpen: false,
      isEligible: false,
      valid: true,
    });
  }
}
async function getPRDetails(owner, repository, prNumber) {
  const response = await octokit.request(
    "GET /repos/{owner}/{repo}/pulls/{pull_number}",
    {
      owner: owner,
      repo: repository,
      pull_number: prNumber,
    }
  );
  return JSON.stringify(response);
}
async function handlePRURL({ owner, repository, isPrUrl, URL }) {
  let prNumber = parseInt(parseurl(URL).pathname.split("/")[4]);
  let resultObj = new Object();
  try {
    // Getting details corresponding to PR Number
    await getPRDetails(owner, repository, prNumber)
      .then((response) => {
        // Check repository for Hacktoberfest
        response = JSON.parse(response);
        const hacktoberfestEligibilityData = JSON.parse(
          checkEligibilityForHacktoberfest(response)
        );
        // console.log("printing hacktoberfestEligibilityData",hacktoberfestEligibilityData);
        resultObj = hacktoberfestEligibilityData;
      })
      .catch((err) => {
        console.log(err);
        const obj = {
          status: 404,
          isOpen: false,
          isEligible: false,
          valid: false,
        };
        resultObj = obj;
      });
  } catch (err) {
    console.log(err);
    const obj = {
      status: 404,
      isOpen: false,
      isEligible: false,
      valid: false,
    };
    resultObj = obj;
  }
  // console.log("pritig from handlePRUEL",resultObj)
  return resultObj;
}
async function getIssues(owner, repository) {
  const response = await octokit.request("GET /repos/{owner}/{repo}/issues", {
    owner: owner,
    repo: repository,
    sort: "created",
    direction: "asc",
  });
  const issues = response.data;
  return issues;
}
async function getTopics(owner, repository) {
  const response = await octokit.request("GET /repos/{owner}/{repo}/topics", {
    owner: owner,
    repo: repository,
    mediaType: { previews: ["mercy"] },
  });
  const topics = response.data;
  return topics;
}
async function handleNonPRURL({ owner, repository, isPrUrl, URL }) {
  let resultObj = new Object();
  try {
    console.log("in try block");
    await getIssues(owner, repository)
      .then((response) => {
        let isBanned = false;
        const issues = response;
        issues.forEach((issue) => {
          const banString =
            "Pull requests here won’t count toward Hacktoberfest.";

          if (issue.title.toLowerCase() == banString.toLowerCase()) {
            isBanned = true;
          }
        });
        return isBanned;
      })
      .then(async (isBanned) => {
        console.log("is Banned", isBanned);
        if (isBanned) {
          // return false
          resultObj = {
            status: 200,
            isOpen: false,
            isEligible: false,
            valid: false,
          };
        } else {
          await getTopics(owner, repository)
            .then((topics) => {
              if (topics.names.includes("hacktoberfest")) {
                // return res.json({
                //   valid: true,
                // });
                resultObj = {
                  status: 200,
                  isOpen: true,
                  isEligible: true,
                  valid: true,
                };
              } else {
                // return res.json({
                //   valid: false,
                // });
                resultObj = {
                  status: 200,
                  isOpen: true,
                  isEligible: false,
                  valid: true,
                };
              }
            })
            .catch((err) => {
              console.log(err);
              resultObj = {
                status: 404,
                isOpen: false,
                isEligible: false,
                valid: false,
              };
            });
        }
      })
      .catch((err) => {
        console.log(err);
        resultObj = {
          status: 404,
          isOpen: false,
          isEligible: false,
          valid: false,
        };
      });
  } catch (err) {
    console.log(err);
    resultObj = {
      status: 404,
      isOpen: false,
      isEligible: false,
      valid: false,
    };
    // return res.json({
    //   valid: false,
    // });
  }
  console.log("resultObj", resultObj);
  return resultObj;
}

app.get("/api", async (req, res) => {
  const URL = req.query.url;
  // Checking if URL is null
  if (URL == null) {
    return res.sendStatus(404);
  }
  // If not get owner, repository name
  const repoObj = JSON.parse(getRepositoryDetailsObject(URL));
  // Checking if URL is PR URL or not
  if (repoObj.isPrUrl) {
    // PR URL
    handlePRURL(repoObj).then((response) => res.json(response));
  } else {
    handleNonPRURL(repoObj).then((response) => {
      res.json(response);
    });
  }
  // res.json(["Tony","Lisa","Michael","Ginger","Food", req.query.url]);
});

// POST Methods
app.post("/check", async (req, res) => {
  var owner = parseurl(req.body.repo).pathname.split("/")[1];
  var repository = parseurl(req.body.repo).pathname.split("/")[2];
  var isPrUrl = parseurl(req.body.repo).pathname.includes("pull");
  if (isPrUrl) {
    // PR URL
    var prNumber = parseInt(parseurl(req.body.repo).pathname.split("/")[4]);
    try {
      const response = await octokit.request(
        "GET /repos/{owner}/{repo}/pulls/{pull_number}",
        {
          owner: owner,
          repo: repository,
          pull_number: prNumber,
        }
      );
      if (response.data.state === "closed") {
        app.set("context", "pr-accepted");
        return res.redirect("/");
      } else {
        app.set("context", "pr-open");
        return res.redirect("/");
      }
    } catch (err) {
      app.set("context", "pr-open");
      return res.redirect("/");
    }
  } else {
    var isBanned = false;
    try {
      const response = await octokit.request(
        "GET /repos/{owner}/{repo}/issues",
        {
          owner: owner,
          repo: repository,
          sort: "created",
          direction: "asc",
        }
      );
      const issues = response.data;
      issues.forEach((issue) => {
        if (
          issue.title == "Pull requests here won’t count toward Hacktoberfest."
        ) {
          isBanned = true;
        }
      });
    } catch (err) {
      app.set("context", "failed");
      return res.redirect("/");
    }

    if (isBanned) {
      app.set("context", "failed");
      return res.redirect("/");
    } else {
      octokit
        .request("GET /repos/{owner}/{repo}/topics", {
          owner: owner,
          repo: repository,
          mediaType: {
            previews: ["mercy"],
          },
        })
        .then((x) => {
          if (x.data.names.includes("hacktoberfest")) {
            app.set("context", "success");
            res.redirect("/");
          } else {
            app.set("context", "failed");
            res.redirect("/");
          }
        })
        .catch((err) => {
          app.set("context", "failed");
          res.redirect("/");
        });
    }
  }
});

app.listen(8000, () => console.log("Listening on port 8000"));
