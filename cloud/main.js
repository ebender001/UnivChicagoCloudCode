
// Use Parse.Cloud.define to define as many cloud functions as you want.
// For example:
require("./src/login.js");
require("./src/saveSurveyResults.js");

Parse.Cloud.define("hello", (request) => {
	return "Hello world!";
});
