const { exportScopeForRole } = require("./roleAccess.js");
const { calculateFrailty } = require("./frailtySummary.js");

const surveyDateFormatter = new Intl.DateTimeFormat("en-US", {
	month: "long",
	day: "numeric",
	year: "numeric",
	timeZone: "UTC"
});

const csvColumns = [
	{ header: "Enrollee ID", key: "enrolleeId" },
	{ header: "Survey Date", key: "surveyDate" },
	{ header: "Frailty Assessment", key: "frailtyAssessment" },
	{ header: "Frailty Score", key: "frailtyScore" },
	{ header: "Weight Loss Score", key: "weightLossScore" },
	{ header: "Current Weight", key: "currentWeight" },
	{ header: "Weight 1 Year Ago", key: "pastWeight" },
	{ header: "BMI", key: "bmi" },
	{ header: "Intentional Weight Loss", key: "intentionalWeightLoss" },
	{ header: "Exhaustion Score", key: "exhaustionScore" },
	{ header: "Everything You Did Was An Effort", key: "effort" },
	{ header: "Could Not Get Going", key: "getGoing" },
	{ header: "Activity Score", key: "activityScore" },
	{ header: "Kcals Expended Per Week", key: "activityKcalsPerWeek" },
	{ header: "Walked Last 2 Weeks", key: "walkedSummary" },
	{ header: "Strenuous Chores", key: "choresSummary" },
	{ header: "Gardening", key: "gardeningSummary" },
	{ header: "Exercise", key: "exerciseSummary" },
	{ header: "Mowed Lawn", key: "mowedLawnSummary" },
	{ header: "Golf", key: "golfSummary" },
	{ header: "Handgrip Score", key: "handgripScore" },
	{ header: "Hand Grip Test Completed", key: "gripCompleted" },
	{ header: "Maximum Hand Grip Score", key: "maxGrip" },
	{ header: "Recorded Hand Grip Values", key: "gripValues" },
	{ header: "Gait Speed Score", key: "gaitSpeedScore" },
	{ header: "Gait Test Completed", key: "gaitCompleted" },
	{ header: "Fastest Walking Speed", key: "fastestGait" },
	{ header: "Recorded Gait Speed Values", key: "gaitValues" }
];

function formatNumber(value) {
	if (!Number.isFinite(value)) return "";
	return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function formatSurveyDate(value) {
	if (!(value instanceof Date)) return "";
	return surveyDateFormatter.format(value);
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

function frailtyJsonRow(row) {
	return {
		enrolleeId: row.enrolleeId,
		surveyDate: row.surveyDate,
		frailtyAssessment: row.frailtyAssessment,
		frailtyScore: row.frailtyScore,
		factors: {
			weightLoss: {
				score: row.weightLossScore,
				currentWeight: row.currentWeight,
				pastWeight: row.pastWeight,
				bmi: row.bmi,
				intentionalWeightLoss: row.intentionalWeightLoss
			},
			exhaustion: {
				score: row.exhaustionScore,
				effort: row.effort,
				couldNotGetGoing: row.getGoing
			},
			activity: {
				score: row.activityScore,
				kcalsExpendedPerWeek: row.activityKcalsPerWeek,
				walkedLast2Weeks: row.walkedSummary,
				strenuousChores: row.choresSummary,
				gardening: row.gardeningSummary,
				exercise: row.exerciseSummary,
				mowedLawn: row.mowedLawnSummary,
				golf: row.golfSummary
			},
			handgrip: {
				score: row.handgripScore,
				testCompleted: row.gripCompleted,
				maximumHandGripScore: row.maxGrip,
				recordedValues: row.gripValues
			},
			gaitSpeed: {
				score: row.gaitSpeedScore,
				testCompleted: row.gaitCompleted,
				fastestWalkingSpeed: row.fastestGait,
				recordedValues: row.gaitValues
			}
		}
	};
}

function serializeCsv(rows) {
	const header = csvColumns.map((column) => csvEscape(column.header)).join(",");
	const body = rows.map((row) => csvColumns.map((column) => csvEscape(row[column.key])).join(","));
	return [header].concat(body).join("\n");
}

async function getCurrentUser(user) {
	const query = new Parse.Query(Parse.User);
	query.include("institution");
	return query.get(user.id, { useMasterKey: true });
}

async function fetchAll(query) {
	const results = [];
	const pageSize = 1000;
	let skip = 0;
	let page = [];

	do {
		query.limit(pageSize);
		query.skip(skip);
		page = await query.find({ useMasterKey: true });
		results.push(...page);
		skip += page.length;
	} while (page.length === pageSize);

	return results;
}

async function findEnrolleesForExport(user) {
	const currentUser = await getCurrentUser(user);
	const exportScope = await exportScopeForRole(currentUser.get("role"));
	const query = new Parse.Query("Enrollee");
	query.include("survey");
	query.exists("survey");
	query.ascending("createdAt");

	if (exportScope === "institution") {
		const institution = currentUser.get("institution");
		if (!institution) {
			throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, "Your user account is not assigned to an institution.");
		}

		query.equalTo("institution", institution);
	}

	return fetchAll(query);
}

Parse.Cloud.define("downloadFrailtyScores", async (request) => {
	if (!request.user) {
		throw new Parse.Error(Parse.Error.SESSION_MISSING, "Login is required to download frailty scores.");
	}

	const format = request.params && request.params.format === "json" ? "json" : "csv";
	const enrollees = await findEnrolleesForExport(request.user);
	const rows = enrollees
		.filter((enrollee) => enrollee.get("survey"))
		.map((enrollee) => ({
			enrolleeId: enrollee.id,
			surveyDate: formatSurveyDate(enrollee.get("survey").createdAt),
			...calculateFrailty(enrollee, enrollee.get("survey"))
		}));

	if (format === "json") {
		return {
			filename: "frailty-scores.json",
			contentType: "application/json",
			count: rows.length,
			content: JSON.stringify(rows.map(frailtyJsonRow), null, 2)
		};
	}

	const csv = serializeCsv(rows);
	return {
		filename: "frailty-scores.csv",
		contentType: "text/csv",
		count: rows.length,
		content: csv,
		csv
	};
});
