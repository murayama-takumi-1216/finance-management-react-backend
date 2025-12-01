import { validationResult } from 'express-validator';

/**
 * Validate request using express-validator
 */
export const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array().map(err => ({
        field: err.path,
        message: err.msg
      }))
    });
  }
  next();
};

/**
 * Common validation error messages
 */
export const errorMessages = {
  required: (field) => `${field} is required`,
  email: 'Invalid email format',
  minLength: (field, min) => `${field} must be at least ${min} characters`,
  maxLength: (field, max) => `${field} must be at most ${max} characters`,
  uuid: (field) => `${field} must be a valid UUID`,
  numeric: (field) => `${field} must be a number`,
  positive: (field) => `${field} must be a positive number`,
  date: (field) => `${field} must be a valid date`,
  enum: (field, values) => `${field} must be one of: ${values.join(', ')}`,
};
