const { 'wt-js-libs': wtJsLibs } = require('@windingtree/wt-js-libs');
const { flattenObject } = require('../services/utils');
const { baseUrl } = require('../config').config;
const { DataFormatValidator } = require('../services/validation');
const {
  HttpValidationError,
  Http404Error,
  HttpBadGatewayError,
} = require('../errors');
const {
  HOTEL_FIELDS,
  HOTEL_DESCRIPTION_FIELDS,
  DEFAULT_HOTELS_FIELDS,
  DEFAULT_HOTEL_FIELDS,
  DEFAULT_PAGE_SIZE,
  SCHEMA_PATH,
  HOTEL_SCHEMA_MODEL,
  VALIDATION_WARNING_HEADER,
} = require('../constants');
const {
  mapHotelObjectToResponse,
  mapHotelFieldsFromQuery,
  REVERSED_HOTEL_FIELD_MAPPING,
} = require('../services/property-mapping');
const {
  paginate,
  LimitValidationError,
  MissingStartWithError,
} = require('../services/pagination');

const resolveHotelObject = async (hotel, offChainFields, onChainFields) => {
  let hotelData = {};
  try {
    if (offChainFields.length) {
      const plainHotel = await hotel.toPlainObject(offChainFields);
      const flattenedOffChainData = flattenObject(plainHotel.dataUri.contents, offChainFields);
      hotelData = {
        dataFormatVersion: plainHotel.dataUri.contents.dataFormatVersion,
        ...flattenedOffChainData.descriptionUri,
        ...(flattenObject(plainHotel, offChainFields)),
      };
      // Some offChainFields need special treatment
      const fieldModifiers = {
        'notificationsUri': (data, source, key) => { data[key] = source[key]; return data; },
        'bookingUri': (data, source, key) => { data[key] = source[key]; return data; },
        'ratePlansUri': (data, source, key) => { data.ratePlans = source[key]; return data; },
        'availabilityUri': (data, source, key) => { data.availability = source[key]; return data; },
      };
      for (let fieldModifier in fieldModifiers) {
        if (flattenedOffChainData[fieldModifier] !== undefined) {
          hotelData = fieldModifiers[fieldModifier](hotelData, flattenedOffChainData, fieldModifier);
        }
      }
    }
    for (let i = 0; i < onChainFields.length; i += 1) {
      if (hotel[onChainFields[i]]) {
        hotelData[onChainFields[i]] = await hotel[onChainFields[i]];
      }
    }
    // Always append hotel chain address as id property
    hotelData.id = hotel.address;
  } catch (e) {
    let message = 'Cannot get hotel data';
    if (e instanceof wtJsLibs.errors.RemoteDataReadError) {
      message = 'Cannot access on-chain data, maybe the deployed smart contract is broken';
    }
    if (e instanceof wtJsLibs.errors.StoragePointerError) {
      message = 'Cannot access off-chain data';
    }
    return {
      error: message,
      originalError: e.message,
      data: {
        id: hotel.address,
      },
    };
  }
  return mapHotelObjectToResponse(hotelData);
};

const calculateFields = (fieldsQuery) => {
  const fieldsArray = Array.isArray(fieldsQuery) ? fieldsQuery : fieldsQuery.split(',');
  const mappedFields = mapHotelFieldsFromQuery(fieldsArray);
  return {
    mapped: mappedFields,
    onChain: mappedFields.map((f) => {
      if (HOTEL_FIELDS.indexOf(f) > -1) {
        return f;
      }
      return null;
    }).filter((f) => !!f),
    toFlatten: mappedFields.map((f) => {
      let firstPart = f;
      if (f.indexOf('.') > -1) {
        firstPart = f.substring(0, f.indexOf('.'));
      }
      if (HOTEL_DESCRIPTION_FIELDS.indexOf(firstPart) > -1) {
        return `descriptionUri.${f}`;
      }
      if ([
        'ratePlansUri',
        'availabilityUri',
        'notificationsUri',
        'bookingUri',
      ].indexOf(firstPart) > -1) {
        return f;
      }
      return null;
    }).filter((f) => !!f),
  };
};

const fillHotelList = async (path, fields, hotels, limit, startWith) => {
  limit = limit ? parseInt(limit, 10) : DEFAULT_PAGE_SIZE;
  let { items, nextStart } = paginate(hotels, limit, startWith, 'address');
  let realItems = [], warningItems = [], realErrors = [];
  let resolvedHotelObject;
  const swaggerDocument = await DataFormatValidator.loadSchemaFromPath(SCHEMA_PATH, HOTEL_SCHEMA_MODEL, fields, REVERSED_HOTEL_FIELD_MAPPING);
  for (let hotel of items) {
    try {
      resolvedHotelObject = await resolveHotelObject(hotel, fields.toFlatten, fields.onChain);
      DataFormatValidator.validate(resolvedHotelObject, 'hotel', HOTEL_SCHEMA_MODEL, swaggerDocument.components.schemas);
      realItems.push(resolvedHotelObject);
    } catch (e) {
      if (e instanceof HttpValidationError) {
        hotel = {
          error: 'Upstream hotel data format validation failed: ' + e.toString(),
          originalError: { valid: e.code.valid, errors: e.code.errors.map((err) => { return err.toString(); }) },
          data: resolvedHotelObject,
        };
        if (e.code && e.code.valid) {
          warningItems.push(hotel);
        } else {
          realErrors.push(hotel);
        }
      } else {
        throw e;
      }
    }
  }
  let next = nextStart ? `${baseUrl}${path}?limit=${limit}&fields=${fields.mapped.join(',')}&startWith=${nextStart}` : undefined;

  if (realErrors.length && realItems.length < limit && nextStart) {
    const nestedResult = await fillHotelList(path, fields, hotels, limit - realItems.length, nextStart);
    realItems = realItems.concat(nestedResult.items);
    warningItems = warningItems.concat(nestedResult.warnings);
    realErrors = realErrors.concat(nestedResult.errors);
    if (realItems.length && nestedResult.nextStart) {
      next = `${baseUrl}${path}?limit=${limit}&fields=${fields.mapped.join(',')}&startWith=${nestedResult.nextStart}`;
    } else {
      next = undefined;
    }
  }
  return {
    items: realItems,
    warnings: warningItems,
    errors: realErrors,
    next,
    nextStart,
  };
};

// Actual controllers

const findAll = async (req, res, next) => {
  const { limit, startWith } = req.query;
  const fieldsQuery = req.query.fields || DEFAULT_HOTELS_FIELDS;

  try {
    let hotels = await res.locals.wt.hotelIndex.getAllHotels();
    const { items, warnings, errors, next } = await fillHotelList(req.path, calculateFields(fieldsQuery), hotels, limit, startWith);
    res.status(200).json({ items, warnings, errors, next });
  } catch (e) {
    if (e instanceof LimitValidationError) {
      return next(new HttpValidationError('paginationLimitError', 'Limit must be a natural number greater than 0.'));
    }
    if (e instanceof MissingStartWithError) {
      return next(new Http404Error('paginationStartWithError', 'Cannot find startWith in hotel collection.'));
    }
    next(e);
  }
};

const find = async (req, res, next) => {
  try {
    const fieldsQuery = req.query.fields || DEFAULT_HOTEL_FIELDS;
    const fields = calculateFields(fieldsQuery);
    const swaggerDocument = await DataFormatValidator.loadSchemaFromPath(SCHEMA_PATH, HOTEL_SCHEMA_MODEL, fields, REVERSED_HOTEL_FIELD_MAPPING);
    let resolvedHotel;
    try {
      resolvedHotel = await resolveHotelObject(res.locals.wt.hotel, fields.toFlatten, fields.onChain);
      if (resolvedHotel.error) {
        return next(new HttpBadGatewayError('hotelNotAccessible', resolvedHotel.error, 'Hotel data is not accessible.'));
      }
      DataFormatValidator.validate(resolvedHotel, 'hotel', HOTEL_SCHEMA_MODEL, swaggerDocument.components.schemas);
    } catch (e) {
      if (e instanceof HttpValidationError) {
        let err = new HttpValidationError();
        if (e.code.hasOwnProperty('GetFormattedErrors')) {
          err.msgLong = e.code.GetFormattedErrors().map((err) => { return err.message; }).toString();
        } else {
          err.msgLong = e.code.errors.toString();
        }
        err.data = resolvedHotel;
        if (e.code && e.code.valid) {
          return res.set(VALIDATION_WARNING_HEADER, e.code.errors).status(200).json(err.toPlainObject());
        } else {
          return res.status(err.status).json(err.toPlainObject());
        }
      } else {
        next(e);
      }
    }
    return res.status(200).json(resolvedHotel);
  } catch (e) {
    return next(new HttpBadGatewayError('hotelNotAccessible', e.message, 'Hotel data is not accessible.'));
  }
};

const meta = async (req, res, next) => {
  try {
    const resolvedHotel = await res.locals.wt.hotel.toPlainObject([]);
    return res.status(200).json({
      address: resolvedHotel.address,
      dataUri: resolvedHotel.dataUri.ref,
      descriptionUri: resolvedHotel.dataUri.contents.descriptionUri,
      ratePlansUri: resolvedHotel.dataUri.contents.ratePlansUri,
      availabilityUri: resolvedHotel.dataUri.contents.availabilityUri,
      dataFormatVersion: resolvedHotel.dataUri.contents.dataFormatVersion,
    });
  } catch (e) {
    return next(new HttpBadGatewayError('hotelNotAccessible', e.message, 'Hotel data is not accessible.'));
  }
};

module.exports = {
  find,
  findAll,
  meta,
};
