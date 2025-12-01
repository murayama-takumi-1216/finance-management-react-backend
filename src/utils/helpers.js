/**
 * Format a date to YYYY-MM-DD
 */
export const formatDate = (date) => {
  if (!date) return null;
  const d = new Date(date);
  return d.toISOString().split('T')[0];
};

/**
 * Format a date to ISO string
 */
export const formatDateTime = (date) => {
  if (!date) return null;
  return new Date(date).toISOString();
};

/**
 * Get the start and end of a period
 */
export const getPeriodDates = (year, month = null, quarter = null) => {
  let startDate, endDate;

  if (quarter) {
    const quarterStartMonth = (quarter - 1) * 3;
    startDate = new Date(year, quarterStartMonth, 1);
    endDate = new Date(year, quarterStartMonth + 3, 0);
  } else if (month !== null) {
    startDate = new Date(year, month - 1, 1);
    endDate = new Date(year, month, 0);
  } else {
    startDate = new Date(year, 0, 1);
    endDate = new Date(year, 11, 31);
  }

  return {
    startDate: formatDate(startDate),
    endDate: formatDate(endDate)
  };
};

/**
 * Calculate percentage change between two values
 */
export const calculatePercentageChange = (oldValue, newValue) => {
  if (oldValue === 0) {
    return newValue > 0 ? 100 : 0;
  }
  return ((newValue - oldValue) / oldValue) * 100;
};

/**
 * Round a number to specified decimal places
 */
export const roundToDecimals = (num, decimals = 2) => {
  return Math.round(num * Math.pow(10, decimals)) / Math.pow(10, decimals);
};

/**
 * Generate a slug from a string
 */
export const slugify = (text) => {
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '')
    .replace(/\-\-+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
};

/**
 * Validate email format
 */
export const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Parse query parameters for pagination
 */
export const parsePagination = (query) => {
  const page = parseInt(query.page) || 1;
  const limit = Math.min(parseInt(query.limit) || 20, 100);
  const offset = (page - 1) * limit;
  return { page, limit, offset };
};

/**
 * Build pagination response
 */
export const buildPaginationResponse = (data, total, page, limit) => {
  const totalPages = Math.ceil(total / limit);
  return {
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1
    }
  };
};

/**
 * Sanitize object by removing undefined/null values
 */
export const sanitizeObject = (obj) => {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== undefined && v !== null && v !== '')
  );
};

/**
 * Get file extension from filename
 */
export const getFileExtension = (filename) => {
  return filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2).toLowerCase();
};

/**
 * Determine file type from extension
 */
export const getFileType = (extension) => {
  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
  const pdfExtensions = ['pdf'];

  if (imageExtensions.includes(extension)) return 'imagen';
  if (pdfExtensions.includes(extension)) return 'pdf';
  return 'otro';
};
