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

function setGeneratedPin(user) {
	const pin = generatePin();
	user.set("hashedPIN", hashPin(pin));
	return pin;
}

module.exports = {
	generatePin,
	hashPin,
	setGeneratedPin
};
