const crypto = require("crypto");

function generatePin() {
	const value = crypto.randomBytes(4).readUInt32BE(0) % 100000;
	return String(value).padStart(5, "0");
}

function hashPin(pin) {
	const salt = crypto.randomBytes(16).toString("hex");
	const hash = crypto
		.createHash("sha256")
		.update(`${salt}:${pin}`)
		.digest("hex");

	return `${salt}:${hash}`;
}

function verifyPin(pin, hashedPin) {
	if (!pin || typeof pin !== "string" || !hashedPin || typeof hashedPin !== "string") {
		return false;
	}

	const parts = hashedPin.split(":");
	if (parts.length !== 2 || !parts[0] || !parts[1]) {
		return false;
	}

	const [salt, storedHash] = parts;
	const submittedHash = crypto
		.createHash("sha256")
		.update(`${salt}:${pin}`)
		.digest("hex");

	return submittedHash === storedHash;
}

function setGeneratedPin(user) {
	const pin = generatePin();
	user.set("hashedPIN", hashPin(pin));
	return pin;
}

module.exports = {
	generatePin,
	hashPin,
	verifyPin,
	setGeneratedPin
};
