const {handle} = require('../../errors')
function validatePasswords (req, res, next) {
  const { password, newPassword } = req.body
  if (!password) return next(handle('missingPassword', new Error()))
  if (!newPassword) return next(handle('missingNewPassword', new Error()))

  next()
}

function validatePassword (req, res, next) {
  const { password } = req.body
  if (!password) return next(handle('missingPassword', new Error()))
  next()
}

function validateHotelInfo (req, res, next) {
  const { password, name, description } = req.body
  if (!password) return next(handle('missingPassword', new Error()))
  if (!name) return next(handle('missingName', new Error()))
  if (!description) return next(handle('missingDescription', new Error()))
  next()
}

function validateAddImage (req, res, next) {
  const { url } = req.body
  if (!url) return next(handle('missingUrl', new Error()))
  next()
}

function validateType (req, res, next) {
  const { type } = req.body
  if (!type) return next(handle('missingType', new Error()))
  next()
}

function validateAmenity (req, res, next) {
  const { amenity } = req.body
  if (!amenity) return next(handle('missingAmenity', new Error()))
  next()
}

function validateActive (req, res, next) {
  const { active } = req.body
  if (!active) return next(handle('missingActive', new Error()))
  next()
}

function validateWallet (req, res, next) {
  const { wallet } = req.body
  if (!wallet) return next(handle('missingWallet', new Error()))
  next()
}

function validateHotelAddress (req, res, next) {
  const { lineOne, lineTwo, zipCode, country } = req.body
  if (!lineOne) return next(handle('missingLineOne', new Error()))
  if (!lineTwo) return next(handle('missingLineTwo', new Error()))
  if (!zipCode) return next(handle('missingZipCode', new Error()))
  if (!country) return next(handle('missingCountry', new Error()))
  next()
}

function validateHotelLocation (req, res, next) {
  const { timezone, latitude, longitude } = req.body
  if (!timezone && timezone !== 0) return next(handle('missingTimezone', new Error()))
  if (!latitude) return next(handle('missingLatitude', new Error()))
  if (!longitude) return next(handle('missingLongitude', new Error()))
  next()
}

function validatePrice (req, res, next) {
  const { price } = req.body
  if (!price) return next(handle('missingPrice', new Error()))
  next()
}

module.exports = {
  validateActive,
  validateAddImage,
  validateAmenity,
  validateHotelInfo,
  validateHotelAddress,
  validateHotelLocation,
  validatePassword,
  validatePasswords,
  validatePrice,
  validateType,
  validateWallet
}
