const { exportScopeForRole } = require("./roleAccess.js");

const surveyDateFormatter = new Intl.DateTimeFormat("en-US", {
	month: "long",
	day: "numeric",
	year: "numeric",
	timeZone: "UTC"
});

const csvColumns = [
	{ header: "Enrollee Number", value: ({ enrollee }) => enrollee ? enrollee.get("enrolleeNumber") : "" },
	{ header: "Survey Date", value: ({ survey }) => formatSurveyDate(survey.createdAt) },
	{ header: "Male", field: "male" },
	{ header: "Height Inches (cm)", value: ({ survey }) => formatInchesWithCm(survey.get("heightInches")) },
	{ header: "Current Weight lb (kg)", value: ({ survey }) => formatPoundsWithKg(survey.get("weightCurrent")) },
	{ header: "Weight 1 Year Ago lb (kg)", value: ({ survey }) => formatPoundsWithKg(survey.get("weightYearAgo")) },
	{ header: "Weight No Change", field: "weightNoChange" },
	{ header: "Weight Loss Intentional", field: "weightLossIntentional" },
	{ header: "Activity is an Effort", field: "effort" },
	{ header: "Could Not Get Going", field: "getGoing" },
	{ header: "Walked Last 2 Weeks", field: "walked" },
	{ header: "Walked Times", field: "walkedTimes" },
	{ header: "Walked Minutes", field: "walkedMinutes" },
	{ header: "Walked Months", field: "walkedMonths" },
	{ header: "Strenuous Chores", field: "chores" },
	{ header: "Chores Times", field: "choresTimes" },
	{ header: "Chores Minutes", field: "choresMinutes" },
	{ header: "Chores Months", field: "choresMonths" },
	{ header: "Gardening", field: "gardening" },
	{ header: "Gardening Times", field: "gardeningTimes" },
	{ header: "Gardening Minutes", field: "gardeningMinutes" },
	{ header: "Gardening Months", field: "gardeningMonths" },
	{ header: "Exercise", field: "exercise" },
	{ header: "Exercise Times", field: "exerciseTimes" },
	{ header: "Exercise Minutes", field: "exerciseMinutes" },
	{ header: "Exercise Months", field: "exerciseMonths" },
	{ header: "Mowed Lawn", field: "mowedLawn" },
	{ header: "Mowed Lawn Times", field: "mowedLawnTimes" },
	{ header: "Mowed Lawn Minutes", field: "mowedLawnMinutes" },
	{ header: "Mowed Lawn Months", field: "mowedLawnMonths" },
	{ header: "Golf", field: "golf" },
	{ header: "Golf Times", field: "golfTimes" },
	{ header: "Golf Minutes", field: "golfMinutes" },
	{ header: "Golf Months", field: "golfMonths" },
	{ header: "Hand Pain", field: "handPain" },
	{ header: "Hand Surgery", field: "handSurgery" }
];

function isPresent(value) {
	return value !== null && value !== undefined && value !== "";
}

function formatSurveyDate(value) {
	if (!(value instanceof Date)) return "";
	return surveyDateFormatter.format(value);
}

function formatNumber(value) {
	if (!Number.isFinite(value)) return "";
	return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function formatInchesWithCm(value) {
	const inches = Number(value);
	if (!Number.isFinite(inches)) return "";

	const cm = inches * 2.54;
	return `${formatNumber(inches)} (${formatNumber(cm)} cm)`;
}

function formatPoundsWithKg(value) {
	const pounds = Number(value);
	if (!Number.isFinite(pounds)) return "";

	const kg = pounds * 0.45359237;
	return `${formatNumber(pounds)} (${formatNumber(kg)} kg)`;
}

function formatValue(value) {
	if (!isPresent(value)) return "";
	if (typeof value === "boolean") return value ? "True" : "False";
	if (value instanceof Date) return value.toISOString();
	return String(value);
}

function csvEscape(value) {
	const text = formatValue(value);
	if (!/[",\r\n]/.test(text)) return text;
	return `"${text.replace(/"/g, '""')}"`;
}

function serializeSurveyRow(survey) {
	const enrollee = survey.get("enrollee") || null;

	return csvColumns.map((column) => {
		const value = column.value
			? column.value({ survey, enrollee })
			: survey.get(column.field);

		return csvEscape(value);
	}).join(",");
}

function surveyJsonRow(survey) {
	const enrollee = survey.get("enrollee") || null;
	const row = {};

	csvColumns.forEach((column) => {
		const value = column.value
			? column.value({ survey, enrollee })
			: survey.get(column.field);

		row[column.header] = formatValue(value);
	});

	return row;
}

async function getCurrentUser(user) {
	const query = new Parse.Query(Parse.User);
	query.include("institution");
	return query.get(user.id, { useMasterKey: true });
}

async function findSurveysForExport(user) {
	const currentUser = await getCurrentUser(user);
	const exportScope = await exportScopeForRole(currentUser.get("role"));
	const query = new Parse.Query("Survey");
	query.include("enrollee");
	query.ascending("createdAt");
	query.limit(1000);

	if (exportScope === "institution") {
		const institution = currentUser.get("institution");
		if (!institution) {
			throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "Your user account is not assigned to an institution.");
		}

		const enrolleeQuery = new Parse.Query("Enrollee");
		enrolleeQuery.equalTo("institution", institution);
		query.matchesQuery("enrollee", enrolleeQuery);
	}

	return query.find({ useMasterKey: true });
}

Parse.Cloud.define("downloadSurveyData", async (request) => {
	if (!request.user) {
		throw new Parse.Error(Parse.Error.SESSION_MISSING, "Login is required to download survey data.");
	}

	const format = request.params && request.params.format === "json" ? "json" : "csv";
	const surveys = await findSurveysForExport(request.user);
	if (format === "json") {
		return {
			filename: "survey-data.json",
			contentType: "application/json",
			count: surveys.length,
			content: JSON.stringify(surveys.map(surveyJsonRow), null, 2)
		};
	}

	const header = csvColumns.map((column) => csvEscape(column.header)).join(",");
	const rows = surveys.map(serializeSurveyRow);
	const csv = [header].concat(rows).join("\n");

	return {
		filename: "survey-data.csv",
		contentType: "text/csv",
		count: surveys.length,
		content: csv,
		csv
	};
});
