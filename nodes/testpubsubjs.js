const { isEqual, uniq } = require('lodash');

const getUpdatedKeys = (oldData, newData) => {
    const data = uniq([...Object.keys(oldData), ...Object.keys(newData)]);
    const keys = [];
    for(const key of data){
      if(!isEqual(oldData[key], newData[key])){
        keys.push(key);
      }
    }
  
    return keys;
  }

// Get all nested keys from an object with their full paths
const getAllNestedKeys = (obj, prefix = '') => {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    return [];
  }
  
  let keys = [];
  for (const key of Object.keys(obj)) {
    const currentPath = prefix ? `${prefix}.${key}` : key;
    // Add the current key path
    keys.push(currentPath);
    
    // If value is an object, recurse and get nested keys
    if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
      keys = keys.concat(getAllNestedKeys(obj[key], currentPath));
    }
  }
  
  return keys;
}

const getDeepUpdatedKeys = (oldData, newData, prefix = '') => {
  // If one side is null/undefined, treat everything as new/removed
  if (!oldData && newData && typeof newData === 'object' && !Array.isArray(newData)) {
    return getAllNestedKeys(newData, prefix);
  }
  
  if (!newData && oldData && typeof oldData === 'object' && !Array.isArray(oldData)) {
    return getAllNestedKeys(oldData, prefix);
  }

  // For regular comparison
  const data = uniq([...Object.keys(oldData || {}), ...Object.keys(newData || {})]);
  const keys = [];
  
  for (const key of data) {
    const oldValue = oldData?.[key];
    const newValue = newData?.[key];
    const currentPath = prefix ? `${prefix}.${key}` : key;
    
    // If both values are objects (and not null), recursively check their properties
    if (
      oldValue && 
      newValue && 
      typeof oldValue === 'object' && 
      typeof newValue === 'object' &&
      !Array.isArray(oldValue) &&
      !Array.isArray(newValue)
    ) {
      const nestedChanges = getDeepUpdatedKeys(oldValue, newValue, currentPath);
      keys.push(...nestedChanges);
    }
    // If values are different, add the current path
    else if (!isEqual(oldValue, newValue)) {
      keys.push(currentPath);
    }
  }
  
  return keys;
}

oldObj = {
  id: "ioj86bndom",
  name: {
    first: "John",
    middle: "Montgomery",
    last: "Smith"
  },
  address: {
    street: "660 K St",
    city: "San Diego",
    state: "California",
    country: "United States"
  }
};

newObj = {
  id: "ioj86bndom",
  name: {
    first: "John",
    last: "Smith"
  },
  address: {
    street: "4914 U.S. 220 Business",
    city: "Randleman",
    state: "Nebraska",
    country: "United States"
  }
};

console.log(getUpdatedKeys(oldObj, newObj)); // [ 'name', 'address' ]

oldObj = {
  id: "ioj86bndom",
  name: {
    first: "John",
    middle: "Montgomery",
    last: "Smith"
  },
  address: {
    street: "660 K St",
    city: "San Diego",
    state: "California",
    country: "United States",
    somethingNested: {
      a: {
        b: true
      }
    }
  }
};

newObj = {
  id: "ioj86bndom",
  name: {
    first: "John",
    middle: "Montgomery",
    last: "Smith"
  },
  address: {
    street: "660 K St",
    city: "San Diego",
    state: "California",
    country: "United States",
    somethingNested: {
      a: {
        b: false
      }
    }
  }
};

console.log(getUpdatedKeys(oldObj, newObj)); // [ 'address' ]

oldObj = {
  id: "ioj86bndom",
  name: {
    first: "John",
    last: "Smith"
  },
  address: {
    street: "660 K St",
    city: "San Diego",
    state: "California",
    country: "United States"
  }
};

newObj = {
  id: "ioj86bndom",
  name: {
    first: "John",
    last: "Smith"
  },
  address: {
    street: "660 K ",
    city: "San Diego",
    state: "California",
    country: "United States"
  }
};

console.log(getUpdatedKeys(oldObj, newObj));
console.log('Deep keys:', getDeepUpdatedKeys(oldObj, newObj));

// Test with a deeply nested object
console.log('\nDeep nested example:');
const deepOldObj = {
  user: {
    profile: {
      name: {
        first: "Jane",
        last: "Doe"
      },
      contact: {
        email: "jane@example.com",
        phone: {
          home: "555-1234",
          mobile: "555-5678"
        }
      }
    },
    settings: {
      theme: "dark",
      notifications: true
    }
  }
};

const deepNewObj = {
  user: {
    profile: {
      name: {
        first: "Jane",
        last: "Smith"  // Changed
      },
      contact: {
        email: "jane.smith@example.com",  // Changed
        phone: {
          home: "555-1234",
          mobile: "555-9876"  // Changed
        }
      }
    },
    settings: {
      theme: "light",  // Changed
      notifications: true
    }
  }
};

console.log('Regular keys:', getUpdatedKeys(deepOldObj, deepNewObj));
console.log('Deep keys:', getDeepUpdatedKeys(deepOldObj, deepNewObj));
console.log("Null to Deep New:", getDeepUpdatedKeys(null, deepNewObj));

// Test for null/new object comparison
console.log('\nNull object comparison:');
const smallObj = {
  a: {
    b: {
      c: 1,
      d: 2
    },
    e: "hello"
  },
  f: true
};

console.log('All nested keys:', getDeepUpdatedKeys(null, smallObj));


console.log("int test", getDeepUpdatedKeys(0, 1));