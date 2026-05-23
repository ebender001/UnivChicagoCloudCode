
// Use Parse.Cloud.define to define as many cloud functions as you want.
// For example:
require("./helloworld.js");

Parse.Cloud.define("hello", (request) => {
	return "Hello world!";
});
