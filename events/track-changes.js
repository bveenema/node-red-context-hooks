// Track change operations - each distinct property change gets a unique change token
let currentChangeToken = 0;

/**
 * Get the next change token for tracking operation batches
 * @returns {number} - A unique token for this change operation
 */
function getNextChangeToken() {
    return ++currentChangeToken;
}


module.exports = {
    getNextChangeToken: getNextChangeToken
};