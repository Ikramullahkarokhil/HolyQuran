/**
 * RTL (Right-to-Left) utility functions for language detection and styling
 */

// RTL language codes
const RTL_LANGUAGES = ["pa", "da", "ar", "fa", "ur", "he", "yi"];

/**
 * Determines if a language code represents an RTL language
 * @param {string} language - The language code (e.g., 'en', 'pa', 'da')
 * @returns {boolean} - True if the language is RTL, false otherwise
 */
export const isRTL = (language) => {
  return RTL_LANGUAGES.includes(language);
};

/**
 * Gets the text alignment style based on language direction
 * @param {string} language - The language code
 * @returns {string} - 'left' for LTR, 'right' for RTL
 */
export const getTextAlignment = (language) => {
  return isRTL(language) ? "right" : "left";
};

/**
 * Gets the writing direction style based on language
 * @param {string} language - The language code
 * @returns {string} - 'ltr' or 'rtl'
 */
export const getWritingDirection = (language) => {
  return isRTL(language) ? "rtl" : "ltr";
};

/**
 * Gets the flex direction for row layouts based on language
 * @param {string} language - The language code
 * @returns {string} - 'row' for LTR, 'row-reverse' for RTL
 */
export const getFlexDirection = (language) => {
  return isRTL(language) ? "row-reverse" : "row";
};

/**
 * Gets margin styles for RTL/LTR layouts
 * @param {string} language - The language code
 * @param {string} side - 'left' or 'right'
 * @param {number} value - The margin value
 * @returns {object} - Style object with appropriate margin
 */
export const getMarginStyle = (language, side, value) => {
  if (isRTL(language)) {
    return side === "right" ? { marginLeft: value } : { marginRight: value };
  }
  return side === "right" ? { marginRight: value } : { marginLeft: value };
};

/**
 * Gets padding styles for RTL/LTR layouts
 * @param {string} language - The language code
 * @param {string} side - 'left' or 'right'
 * @param {number} value - The padding value
 * @returns {object} - Style object with appropriate padding
 */
export const getPaddingStyle = (language, side, value) => {
  if (isRTL(language)) {
    return side === "right" ? { paddingLeft: value } : { paddingRight: value };
  }
  return side === "right" ? { paddingRight: value } : { paddingLeft: value };
};
