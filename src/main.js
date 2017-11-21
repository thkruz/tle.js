import SatelliteJS from 'satellite.js';
import { isPositive } from './tle-utils';

const satellitejs = (SatelliteJS.twoline2satrec) ? SatelliteJS : SatelliteJS.satellite;
const MS_IN_A_DAY = 1000 * 60 * 60 * 24;

// Data formats for TLE orbital elements.
const DATA_TYPES = {
  INT: 'INT',
  FLOAT: 'FLOAT',
  CHAR: 'CHAR',
  DECIMAL_ASSUMED: 'DECIMAL_ASSUMED',    // 12345   -> 0.12345
  DECIMAL_ASSUMED_E: 'DECIMAL_ASSUMED_E' // 12345-2 -> 0.0012345
};

/**
 * Fixed locations of orbital element value strings as they have appeared going back to
 * punchcards.
 * See https://en.wikipedia.org/wiki/Two-line_element_set.
 */
const tleLines = {
  line1: {
    /* TLE line number. Will always return 1 for valid TLEs. */
    lineNumber1: {
      start: 0,
      length: 1,
      type: DATA_TYPES.INT
    },

    /**
     * NORAD satellite catalog number (Sputnik's rocket was 00001).
     *
     * Range: 0 to 99999
     * Example: 25544
     */
    satelliteNumber: {
      start: 2,
      length: 5,
      type: DATA_TYPES.INT
    },

    /**
     * Satellite classification.
     * 'U' = unclassified
     * 'C' = classified
     * 'S' = secret)
     *
     * Example: 'U'
     */
    classification: {
      start: 7,
      length: 1,
      type: DATA_TYPES.CHAR
    },

    /**
     * International Designator: Last 2 digits of launch year. 57 to 99 = 1900s, 00-56 = 2000s.
     * See https://en.wikipedia.org/wiki/International_Designator
     *
     * Range: 00 to 99
     * Example: 98
     */
    intDesignatorYear: {
      start: 9,
      length: 2,
      type: DATA_TYPES.INT
    },

    /**
     * International Designator: Launch number of the year.
     * See https://en.wikipedia.org/wiki/International_Designator
     *
     * Range: 1 to 999
     * Example: 67
     */
    intDesignatorLaunchNumber: {
      start: 11,
      length: 3,
      type: DATA_TYPES.INT
    },

    /**
     * International Designator: Piece of the launch.
     * See https://en.wikipedia.org/wiki/International_Designator
     *
     * Range: A to ZZZ
     * Example: 'A'
     */
    intDesignatorPieceOfLaunch: {
      start: 14,
      length: 3,
      type: DATA_TYPES.CHAR
    },

    /**
     * Year when the TLE was generated (TLE epoch), last two digits.
     *
     * Range: 00 to 99
     * Example: 17
     */
    epochYear: {
      start: 18,
      length: 2,
      type: DATA_TYPES.INT
    },

    /**
     * Fractional day of the year when the TLE was generated (TLE epoch).
     *
     * Range: 1 to 365.99999999
     * Example: 206.18396726
     */
    epochDay: {
      start: 20,
      length: 12,
      type: DATA_TYPES.FLOAT
    },

    /**
     * First Time Derivative of the Mean Motion divided by two.  Defines how mean motion changes
     * from day to day, so TLE propagators can still be used to make reasonable guesses when
     * times are distant from the original TLE epoch.
     *
     * Units: Orbits / day ^ 2
     * Example: 0.00001961
     */
    firstTimeDerivative: {
      start: 33,
      length: 11,
      type: DATA_TYPES.FLOAT
    },

    /**
     * Second Time Derivative of Mean Motion divided by six (decimal point assumed). Measures rate
     * of change in the Mean Motion Dot so software can make reasonable guesses when times are
     * distant from the original TLE epoch.
     *
     * Usually zero, unless the satellite is manuevering or in a decaying orbit.
     *
     * Units: Orbits / day ^ 3.
     * Example: 0 ('00000-0' in the original TLE [= 0.00000 * 10 ^ 0])
     */
    secondTimeDerivative: {
      start: 44,
      length: 8,
      type: DATA_TYPES.DECIMAL_ASSUMED_E
    },

    /**
     * BSTAR drag term (decimal point assumed).  Estimates the effects of
     * atmospheric drag on the satellite's motion.
     *
     * Units: EarthRadii ^ -1
     * Example: 0.000036771 ('36771-4' in the original TLE [= 0.36771 * 10 ^ -4])
     */
    bstarDrag: {
      start: 53,
      length: 8,
      type: DATA_TYPES.DECIMAL_ASSUMED_E
    },

    /**
     * Private value - used by Air Force Space Command to reference the orbit model used to
     * generate the TLE.  Will always be seen as zero externally (e.g. by "us", unless you are
     * "them" - in which case, hello!).
     *
     * Example: 0
     */
    orbitModel: {
      start: 62,
      length: 1,
      type: DATA_TYPES.INT
    },

    /**
     * TLE element set number, incremented for each new TLE generated. 999 seems to mean the TLE
     * has maxed out.
     *
     * Range: Technically 1 to 9999, though in practice the maximum number seems to be 999.
     * Example: 999
     */
    tleSetNumber: {
      start: 64,
      length: 4,
      type: DATA_TYPES.INT
    },

    /*
     * TLE line 1 checksum (modulo 10), for verifying the integrity of this line of the TLE.
     *
     * Range: 0 to 9
     * Example: 3
     */
    checksum1: {
      start: 68,
      length: 1,
      type: DATA_TYPES.INT
    }
  },

  line2: {
    /* TLE line number. Will always return 2 for valid TLEs. */
    lineNumber2: {
      start: 0,
      length: 1,
      type: DATA_TYPES.INT
    },

    /**
     * NORAD satellite catalog number (Sputnik's rocket was 00001).  Should match the satellite
     * number on line 1.
     *
     * Range: 0 to 99999
     * Example: 25544
     */
    satelliteNumber2: {
      start: 2,
      length: 5,
      type: DATA_TYPES.INT
    },

    /**
     * Inclination relative to the Earth's equatorial plane in degrees. 0 to 90 degrees is a
     * prograde orbit and 90 to 180 degrees is a retrograde orbit.
     *
     * Units: degrees
     * Range: 0 to 180
     * Example: 51.6400
     */
    inclination: {
      start: 8,
      length: 8,
      type: DATA_TYPES.FLOAT
    },

    /**
     * Right ascension of the ascending node in degrees. Essentially, this is the angle of the
     * satellite as it crosses northward (ascending) across the Earth's equator (equatorial
     * plane).
     *
     * Units: degrees
     * Range: 0 to 359.9999
     * Example: 208.9163
     */
    rightAscension: {
      start: 17,
      length: 8,
      type: DATA_TYPES.FLOAT
    },

    /**
     * Orbital eccentricity, decimal point assumed. All artifical Earth satellites have an
     * eccentricity between 0 (perfect circle) and 1 (parabolic orbit).
     *
     * Range: 0 to 1
     * Example: 0.0006317 (`0006317` in the original TLE)
     */
    eccentricity: {
      start: 26,
      length: 7,
      type: DATA_TYPES.DECIMAL_ASSUMED
    },

    /**
     * Argument of perigee. See https://en.wikipedia.org/wiki/Argument_of_perigee
     * Units: degrees
     * Range: 0 to 359.9999
     * Example: 69.9862
     */
    perigee: {
      start: 34,
      length: 8,
      type: DATA_TYPES.FLOAT
    },

    /**
     * Mean anomaly. Indicates where the satellite was located within its orbit at the time of the
     * TLE epoch.
     * See https://en.wikipedia.org/wiki/Mean_Anomaly
     *
     * Units: degrees
     * Range: 0 to 359.9999
     * Example: 25.2906
     */
    meanAnomaly: {
      start: 43,
      length: 8,
      type: DATA_TYPES.FLOAT
    },

    /**
     * Revolutions around the Earth per day (mean motion).
     * See https://en.wikipedia.org/wiki/Mean_Motion
     *
     * Range: 0 to 17 (theoretically)
     * Example: 15.54225995
     */
    meanMotion: {
      start: 52,
      length: 11,
      type: DATA_TYPES.FLOAT
    },

    /**
     * Total satellite revolutions when this TLE was generated. This number seems to roll over
     * (e.g. 99999 -> 0).
     *
     * Range: 0 to 99999
     * Example: 6766
     */
    revNumberAtEpoch: {
      start: 63,
      length: 5,
      type: DATA_TYPES.INT
    },

    /*
     * TLE line 1 checksum (modulo 10), for verifying the integrity of this line of the TLE.
     *
     * Range: 0 to 9
     * Example: 0
     */
    checksum2: {
      start: 68,
      length: 1,
      type: DATA_TYPES.INT
    }
  }
};

export default class TLEJS {
  constructor() {
    this.createAllTLEGetters(tleLines);

    this.cache = {
      antemeridianCrossings: {}
    };
  }

  /**
   * Parses a TLE from a string or array input.  Both two and three-line variants are acceptable.
   */
  parseTLE(inputTLE) {
    const fnName = 'parseTLE';

    // Check if already an instance of a TLE object.
    if (typeof inputTLE === 'object' && inputTLE.arr) return inputTLE;
    const tleStrLong = (Array.isArray(inputTLE)) ? inputTLE.join('') : inputTLE;
    const tleStr = tleStrLong.substr && tleStrLong.substr(0, 30);
    const cacheKey = `${fnName}-${tleStr}`;
    if (this.cache[cacheKey]) return this.cache[cacheKey];

    const outputObj = {};
    const tleType = (Array.isArray(inputTLE)) ? 'array' : typeof inputTLE;
    let tleArr = [];

    switch (tleType) {
    case 'array':
      // Make a copy.
      tleArr = inputTLE.concat();
      break;

    case 'string':
      // Convert string to array.
      tleArr = inputTLE.split('\n');
      break;

    default:
      throw new Error('TLE input is invalid');
    }

    // Handle 2 and 3 line variants.
    if (tleArr.length > 2) {
      // 3-line TLE with satellite name as the first line.

      // Keep track of satellite name.
      outputObj.name = tleArr[0];

      // Remove name from array.
      tleArr.splice(0, 1);
    } else {
      // 2-line TLE with no satellite name.
      outputObj.name = 'Unknown';
    }

    // Trim spaces
    tleArr = tleArr.map(line => line.trim());

    outputObj.arr = tleArr;

    this.cache[cacheKey] = outputObj;

    return outputObj;
  }

  /**
   * Determines if a TLE is valid, checking for the presence of line numbers and making sure
   * the calculated checksum matches the expected checksum.
   */
  isValidTLE(tle) {
    const fnName = 'isValidTLE';

    const parsedTLE = this.parseTLE(tle);
    const tleStr = parsedTLE.arr.join('').substr(0, 30);
    const cacheKey = `${fnName}-${tleStr}`;
    if (this.cache[cacheKey]) return this.cache[cacheKey];

    let isValid = true;

    if (parsedTLE.arr.length !== 2) return false;

    // Check line numbers and checksums at the same time.
    parsedTLE.arr.forEach((line, index) => {
      // Noop if already invalid.
      if (!isValid) return;

      const lineNumber = index + 1;

      // Check line number.
      const parsedLineNumber = this[`getLineNumber${lineNumber}`](parsedTLE);
      const lineNumberIsValid = parsedLineNumber === lineNumber;

      // Checksum.
      const calculatedLineChecksum = this.tleLineChecksum(parsedTLE.arr[index]);
      const parsedChecksum = this[`getChecksum${lineNumber}`](parsedTLE);
      const checksumIsValid = parsedChecksum === calculatedLineChecksum;

      if (!lineNumberIsValid || !checksumIsValid) {
        isValid = false;
      }
    });

    this.cache[cacheKey] = isValid;

    return isValid;
  }

  /**
   * Determines the checksum for a single line of a TLE.
   *
   * Checksum = modulo 10 of sum of all numbers (including line number) + 1 for each negative
   * sign (-).  Everything else is ignored.
   */
  tleLineChecksum(tleLineStr) {
    const charArr = tleLineStr.split('');

    // Remove trailing checksum.
    charArr.splice(charArr.length - 1, 1);

    if (charArr.length === 0) {
      throw new Error('Character array empty!', tleLineStr);
    }

    const checksum = charArr.reduce((sum, val) => {
      const parsedVal = parseInt(val, 10);
      const parsedSum = parseInt(sum, 10);

      if (Number.isInteger(parsedVal)) {
        return parsedSum + parsedVal;
      } else if (val === '-') {
        return parsedSum + 1;
      }

      return parsedSum;
    });

    return checksum % 10;
  }

  /**
   * Determines the amount of digits in a number.  Used for converting a TLE's "leading decimal
   * assumed" notation.
   *
   * Example:
   * getDigitCount(12345);
   * -> 5
   */
  getDigitCount(num) {
    const absVal = Math.abs(num);
    return absVal.toString().length;
  }

  /**
   * Converts a TLE's "leading decimal assumed" notation to a float representation.
   *
   * Example:
   * toLeadingDecimal(12345);
   * -> 0.12345
   */
  toLeadingDecimal(num) {
    const numDigits = this.getDigitCount(num);
    const zeroes = '0'.repeat(numDigits - 1);
    return parseFloat(num * `0.${zeroes}1`);
  }

  /**
   * Converts a TLE's "leading decimal assumed" notation with leading zeroes to a float
   * representation.
   *
   * Example:
   * decimalAssumedEToFloat('12345-4');
   * -> 0.000012345
   */
  decimalAssumedEToFloat(str) {
    const numWithAssumedLeadingDecimal = str.substr(0, str.length - 2);
    const num = this.toLeadingDecimal(numWithAssumedLeadingDecimal);
    const leadingDecimalPoints = parseInt(str.substr(str.length - 2, 2), 10);
    const float = num * Math.pow(10, leadingDecimalPoints);
    return float.toPrecision(5);
  }

  /**
   * Creates simple getters for each line of a TLE.
   */
  createAllTLEGetters(lines) {
    const boundCreateTLELineGetters = this.createTLELineGetters.bind(this, lines);
    Object.keys(lines).forEach(boundCreateTLELineGetters);
  }

  /**
   * Creates simple getters for all values on a single line of a TLE.
   */
  createTLELineGetters(lines, line) {
    const boundCreateTLEValGetter = this.createTLEValGetter.bind(this, line);
    Object.keys(lines[line]).forEach(boundCreateTLEValGetter);
  }

  /**
   * Creates a simple getter for a single TLE value.
   *
   * TODO: proper ES6 getters?
   */
  createTLEValGetter(tleLine, prop) {
    this[this.toCamelCase(`get-${prop}`)] = (tle) => {
      const parsedTLE = this.parseTLE(tle);

      const tleArr = parsedTLE.arr;
      const line = (tleLine === 'line1') ? tleArr[0] : tleArr[1];
      const start = tleLines[tleLine][prop].start;
      const length = tleLines[tleLine][prop].length;

      const substr = line.substr(start, length);

      let output;
      switch (tleLines[tleLine][prop].type) {
      case DATA_TYPES.INT:
        output = parseInt(substr, 10);
        break;

      case DATA_TYPES.FLOAT:
        output = parseFloat(substr);
        break;

      case DATA_TYPES.DECIMAL_ASSUMED:
        output = parseFloat(`0.${substr}`);
        break;

      case DATA_TYPES.DECIMAL_ASSUMED_E:
        output = this.decimalAssumedEToFloat(substr);
        break;

      case DATA_TYPES.CHAR:
      default:
        output = substr.trim();
        break;
      }

      return output;
    };
  }

  /**
   * Converts a string divided by spacer characters to camelCase representation.
   *
   * Examples:
   * toCamelCase('foo-bar');
   * -> 'fooBar'
   * toCamelCase('foo bar', ' ');
   * -> 'fooBar'
   */
  toCamelCase(str, divider) {
    divider = divider || '-';

    const bits = str.split(divider);

    const output = [];

    output.push(bits[0]);

    for (let i = 1, len = bits.length; i < len; i++) {
      output.push(bits[i].substr(0, 1).toUpperCase() + bits[i].substr(1, bits[i].length - 1));
    }

    return output.join('');
  }

  /**
   * Determines the Unix timestamp (in ms) of a TLE epoch (the time a TLE was generated).
   *
   * Example:
   * getEpochTimestamp(tleStr);
   * -> 1500956694771
   */
  getEpochTimestamp(tle) {
    const epochDay = this.getEpochDay(tle);
    const epochYear = this.getEpochYear(tle);
    return this.dayOfYearToTimeStamp(epochDay, epochYear);
  }

  /**
   * Determines the name of a satellite, if present in the first line of a 3-line TLE.  If not
   * present, 'Unknown' is returned.
   *
   * Example:
   * getSatelliteName(tleStr);
   * -> 'ISS (ZARYA)'
   */
  getSatelliteName(tle) {
    const parsedTLE = this.parseTLE(tle);
    return parsedTLE.name;
  }

  /**
   * Determines satellite position and look angles from an earth observer.
   *
   * Example:
   * const timestampMS = 1501039265000;
   * const observer = {
   *   lat: 34.243889,
   *   lng: -116.911389,
   *   height: 0
   * };
   * const satInfo = tle.getSatelliteInfo(
   *   tleStr,          // Satellite TLE string or array.
   *   timestampMS,     // Timestamp (ms)
   *   observer.lat,    // Observer latitude (degrees)
   *   observer.lng,    // Observer longitude (degrees)
   *   observer.height  // Observer elevation (km)
   * );
   *
   * ->
   * {
   *   // satellite compass heading from observer in degrees (0 = north, 180 = south)
   *   azimuth: 294.5780478624994,
   *
   *   // satellite elevation from observer in degrees (90 is directly overhead)
   *   elevation: 81.63903620330046,
   *
   *   // km distance from observer to spacecraft
   *   range: 406.60211015810074,
   *
   *   // spacecraft altitude in km
   *   height: 402.9082788620108,

   *   // spacecraft latitude in degrees
   *   lat: 34.45112876592785,

   *   // spacecraft longitude in degrees
   *   lng: -117.46176597710809,
   *
   *   // spacecraft velocity in km/s
   *   velocity: 7.675627442183371
   * }
   */
  getSatelliteInfo(tle, timestamp, observerLat, observerLng, observerHeight) {
    const fnName = 'getSatelliteInfo';

    const timestampCopy = timestamp || Date.now();

    const tleArr = (this.parseTLE(tle)).arr;
    const tleStrShort = tleArr.join('').substr(0, 30);

    const defaultObserverPosition = {
      lat: 36.9613422,
      lng: -122.0308,
      height: 0.370
    };

    const obsLat = observerLat || defaultObserverPosition.lat;
    const obsLng = observerLng || defaultObserverPosition.lng;
    const obsHeight = observerHeight || defaultObserverPosition.height;

    // Memoization
    const cacheKey = `${fnName}-${tleStrShort}-${timestampCopy}-${observerLat}-${observerLng}
-${observerHeight}`;
    if (this.cache[cacheKey]) return this.cache[cacheKey];

    // Sanity check
    if (!satellitejs) {
      throw new Error('satellite.js not found');
    }

    // Initialize a satellite record
    const satrec = satellitejs.twoline2satrec(tleArr[0], tleArr[1]);

    const time = new Date(timestampCopy);

    // Propagate SGP4.
    const positionAndVelocity = satellitejs.propagate(satrec, time);

    if (satellitejs.error) {
      throw new Error('Error: problematic TLE with unexpected eccentricity');
    }

    // The position_velocity result is a key-value pair of ECI coordinates.
    // These are the base results from which all other coordinates are derived.
    const positionEci = positionAndVelocity.position;
    const velocityEci = positionAndVelocity.velocity;

    // Set the observer position (in radians).
    const observerGd = {
      latitude: this.degreesToRadians(obsLat),
      longitude: this.degreesToRadians(obsLng),
      height: obsHeight
    };

    // Get GMST for some coordinate transforms.
    // http://en.wikipedia.org/wiki/Sidereal_time#Definition
    const gmst = satellitejs.gstimeFromDate(time);

    // Get ECF, Geodetic, Look Angles, and Doppler Factor.
    const positionEcf = satellitejs.eciToEcf(positionEci, gmst);
    const positionGd = satellitejs.eciToGeodetic(positionEci, gmst);
    const lookAngles = satellitejs.ecfToLookAngles(observerGd, positionEcf);

    const velocityKmS =
      Math.sqrt(Math.pow(velocityEci.x, 2) +
      Math.pow(velocityEci.y, 2) +
      Math.pow(velocityEci.z, 2));

    // Azimuth: is simply the compass heading from the observer's position.
    const azimuth = lookAngles.azimuth;

    // Geodetic coords are accessed via `longitude`, `latitude`, `height`.
    const longitude = positionGd.longitude;
    const latitude = positionGd.latitude;
    const height = positionGd.height;

    const output = {
      lng: satellitejs.degreesLong(longitude),
      lat: satellitejs.degreesLat(latitude),
      elevation: this.radiansToDegrees(lookAngles.elevation),
      azimuth: this.radiansToDegrees(azimuth),
      range: lookAngles.rangeSat,
      height,
      velocity: velocityKmS
    };

    this.cache[cacheKey] = output;

    return output;
  }

  /**
   * Determines current satellite position, or position at optional timestamp if passed in.
   */
  getLatLon(tle, optionalTimestamp = Date.now()) {
    const tleObj = this.parseTLE(tle);

    // Validation.
    if (!this.isValidTLE(tleObj)) {
      throw new Error('TLE could not be parsed:', tle);
    }

    const satInfo = this.getSatelliteInfo(tleObj.arr, optionalTimestamp);
    return {
      lat: satInfo.lat,
      lng: satInfo.lng
    };
  }

  /**
   * Determines current satellite position, or position at optional timestamp if passed in.
   */
  getLatLonArr(tle, optionalTimestamp = Date.now()) {
    const ll = this.getLatLon(tle, optionalTimestamp);
    return [ll.lat, ll.lng];
  }

  /**
   * Converts radians (0 to 2π) to degrees (0 to 360).
   */
  radiansToDegrees(radians) {
    return radians * (180 / Math.PI);
  }

  /**
   * Converts degrees (0 to 360) to radians (0 to 2π).
   */
  degreesToRadians(degrees) {
    return degrees * (Math.PI / 180);
  }

  /**
   * Determines the position of the satellite at the time the TLE was generated.
   */
  getLatLonAtEpoch(tle) {
    return this.getLatLon(tle, this.getEpochTimestamp(tle));
  }

  /**
   * Determines the average orbit length of the satellite in minutes.
   */
  getAverageOrbitLengthMins(tle) {
    const fnName = 'getAverageOrbitLengthMins';

    const tleStr = tle.join('').substr(0, 30);
    const cacheKey = `${fnName}-${tleStr}`;
    if (this.cache[cacheKey]) return this.cache[cacheKey];

    const meanMotionSeconds = (24 * 60) / this.getMeanMotion(tle);

    this.cache[cacheKey] = meanMotionSeconds;

    return meanMotionSeconds;
  }

  /**
   * Converts a fractional day of the year to a timestamp.  Used for parsing the TLE epoch.
   */
  dayOfYearToTimeStamp(dayOfYear, year) {
    year = year || (new Date()).getFullYear();
    const yearStart = new Date(`1/1/${year} 0:0:0 Z`);

    const yearStartMS = yearStart.getTime();

    return Math.floor(yearStartMS + ((dayOfYear - 1) * MS_IN_A_DAY));
  }

  /**
   * Determines the Unix timestamp (in ms) of the the TLE epoch (when the TLE was generated).
   */
  getTLEEpochTimestamp(tle) {
    const epochYear = this.getEpochYear(tle);
    const epochDayOfYear = this.getEpochDay(tle);
    const timestamp = this.dayOfYearToTimeStamp(epochDayOfYear, epochYear);

    return timestamp;
  }

  /**
   * Determines if the last antemeridian crossing has been cached.  If it has, the time (in ms)
   * is returned, otherwise it returns false.
   */
  getCachedLastAntemeridianCrossingTimeMS(tle, timeMS) {
    const orbitLengthMS = this.getAverageOrbitLengthMins(tle.arr) * 60 * 1000;

    const tleStr = tle.arr.join('').substr(0, 30);

    const cachedCrossingTimes = this.cache.antemeridianCrossings[tleStr];
    if (!cachedCrossingTimes) return false;

    if (cachedCrossingTimes === -1) return cachedCrossingTimes;

    const cachedTime = cachedCrossingTimes.filter(val => {
      if (typeof val === 'object' && val.tle === tle) return -1;

      const diff = timeMS - val;
      const isDiffPositive = diff > 0;
      const isWithinOrbit = isDiffPositive && diff < orbitLengthMS;
      return isWithinOrbit;
    });

    return cachedTime[0] || false;
  }

  /**
   * Determines the last time the satellite crossed the antemeridian.  For mapping convenience
   * and to avoid headaches, we want to avoid plotting ground tracks that cross the antemeridian.
   */
  getLastAntemeridianCrossingTimeMS(tle, timeMS) {
    const parsedTLE = this.parseTLE(tle);

    const cachedVal = this.getCachedLastAntemeridianCrossingTimeMS(parsedTLE, timeMS);
    if (cachedVal) return cachedVal;

    const time = timeMS || Date.now();

    let step = 1000 * 60 * 10;
    let curLatLon = [];
    let lastLatLon = [];
    let curTimeMS = time;
    let didCrossAntemeridian = false;
    let tries = 0;
    let isDone = false;
    const maxTries = 1000;
    while (!isDone) {
      curLatLon = this.getLatLonArr(parsedTLE.arr, curTimeMS);

      didCrossAntemeridian = this.crossesAntemeridian(lastLatLon[1], curLatLon[1]);
      if (didCrossAntemeridian) {
        // back up
        curTimeMS += step;
        step = (step > 20000) ? 20000 : step / 2;
      } else {
        curTimeMS -= step;
        lastLatLon = curLatLon;
      }

      isDone = step < 500 || tries >= maxTries;

      tries++;
    }

    const couldNotFindCrossing = tries - 1 === maxTries;
    const crossingTime = (couldNotFindCrossing) ? -1 : parseInt(curTimeMS, 10);

    const tleStr = parsedTLE.arr.join('').substr(0, 30);
    if (!this.cache.antemeridianCrossings[tleStr]) this.cache.antemeridianCrossings[tleStr] = [];

    if (couldNotFindCrossing) {
      this.cache.antemeridianCrossings[tleStr] = -1;
    } else {
      this.cache.antemeridianCrossings[tleStr].push(crossingTime);
    }

    return crossingTime;
  }

  /**
   * Determines the average amount of milliseconds in one orbit.
   */
  getOrbitTimeMS(tle) {
    return parseInt(MS_IN_A_DAY / this.getMeanMotion(tle), 10);
  }

  /**
   * Calculates three orbit arrays of latitude/longitude pairs.
   *
   * Example:
   * const threeOrbitsArr = tle.getGroundTrackLatLng(tleStr);
   * ->
   * [
   *   // previous orbit
   *   [
   *     [ 45.85524291891481, -179.93297540317567 ],
   *     ...
   *   ],
   *
   *   // current orbit
   *   [
   *     [ 51.26165992503701, -179.9398612198045 ],
   *     ...
   *   ],
   *
   *   // next orbit
   *   [
   *     [ 51.0273714070371, -179.9190165549038 ],
   *     ...
   *   ]
   * ]
   */
  getGroundTrackLatLng(tle, stepMS, optionalTimeMS) {
    const fnName = 'getGroundTrackLatLng';

    const timeMS = optionalTimeMS || Date.now();
    const timeS = (timeMS / 1000).toFixed();

    const parsedTLE = this.parseTLE(tle);
    const tleStrTrimmed = parsedTLE.arr[1].substr(0, 30);

    const orbitTimeMS = this.getOrbitTimeMS(tle);
    const curOrbitStartMS = this.getLastAntemeridianCrossingTimeMS(parsedTLE, timeMS);

    const foundCrossing = curOrbitStartMS !== -1;

    let cacheKey;
    if (foundCrossing) {
      const curOrbitStartS = (curOrbitStartMS / 1000).toFixed();

      // Check for memoized values.
      cacheKey = `${fnName}-${tleStrTrimmed}-${stepMS}-${curOrbitStartS}`;
      if (this.cache[cacheKey]) return this.cache[cacheKey];
    } else {
      // Geosync or unusual orbit.

      cacheKey = `${fnName}-${tleStrTrimmed}-${stepMS}-${timeS}`;
      if (this.cache[cacheKey]) return this.cache[cacheKey];

      this.cache[cacheKey] = [
        this.getOrbitTrack(parsedTLE.arr, timeMS, 600000, 86400000)
      ];

      return this.cache[cacheKey];
    }

    const lastOrbitStartMS = this.getLastAntemeridianCrossingTimeMS(tle, curOrbitStartMS - 10000);
    const nextOrbitStartMS = this.getLastAntemeridianCrossingTimeMS(
        tle, curOrbitStartMS + orbitTimeMS + (1000 * 60 * 30));

    const orbitStartTimes = [
      lastOrbitStartMS,
      curOrbitStartMS,
      nextOrbitStartMS
    ];

    const orbitLatLons = orbitStartTimes.map(
      orbitStartMS => this.getOrbitTrack(parsedTLE.arr, orbitStartMS, stepMS, false)
    );

    this.cache[cacheKey] = orbitLatLons;

    return orbitLatLons;
  }

  /**
   * Generates an array of lat/lng pairs representing a ground track (orbit track), starting
   * from startTimeMS and continuing until crossing the antemeridian, which is considered the end
   * of the orbit for convenience.
   */
  getOrbitTrack(TLEArr, startTimeMS, stepMS, maxTimeMS = 6000000) {
    const fnName = 'getOrbitTrack';

    if (!startTimeMS) return [];

    // Memoization.
    const tleStr = TLEArr.join('');
    const tleStrTrimmed = tleStr.substr(0, 30);
    const startTime = (startTimeMS / 10000).toFixed();
    const cacheKey = `${fnName}-${tleStrTrimmed}-${startTime}-${stepMS}`;
    if (this.cache[cacheKey]) return this.cache[cacheKey];

    // default to 1 minute intervals
    const defaultStepMS = 1000 * 60 * 1;
    let stepMSCopy = stepMS || defaultStepMS;

    const latLons = [];
    let curTimeMS = startTimeMS;
    let lastLatLon = [];
    let curLatLon = [];
    let isDone = false;
    let crossesAntemeridian = false;
    while (!isDone) {
      curLatLon = this.getLatLonArr(TLEArr, curTimeMS);

      crossesAntemeridian = this.crossesAntemeridian(lastLatLon[1], curLatLon[1]);
      if (crossesAntemeridian) {
        if (stepMSCopy === 500) isDone = true;

        // Go back a bit.
        curTimeMS -= stepMSCopy;
        stepMSCopy = 500;
      } else {
        latLons.push(curLatLon);
        curTimeMS += stepMSCopy;
        lastLatLon = curLatLon;
      }

      if (maxTimeMS && (curTimeMS - startTimeMS > maxTimeMS)) isDone = true;
    }

    this.cache[cacheKey] = latLons;

    return latLons;
  }

  /**
   * Determes the compass bearing from the perspective of the satellite.  Useful for 3D / pitched
   * map perspectives.
   *
   * TODO: a bit buggy at extreme parts of orbits, where latitude hardly changes.
   */
  getSatBearing(tle, customTimeMS) {
    const parsedTLE = this.parseTLE(tle);

    const timeMS = customTimeMS || Date.now();

    const latLon1 = this.getLatLonArr(parsedTLE.arr, timeMS);
    const latLon2 = this.getLatLonArr(parsedTLE.arr, timeMS + 10000);

    const crossesAntemeridian = this.crossesAntemeridian(latLon1[1], latLon2[1]);

    if (crossesAntemeridian) {
      // TODO: fix
      return {};
      // return this.getSatBearing(tle, customTimeMS + 10000);
    }

    const lat1 = this.degreesToRadians(latLon1[0]);
    const lat2 = this.degreesToRadians(latLon2[0]);
    const lon1 = this.degreesToRadians(latLon1[1]);
    const lon2 = this.degreesToRadians(latLon2[1]);

    const NS = (lat1 >= lat2) ? 'S' : 'N';
    const EW = (lon1 >= lon2) ? 'W' : 'E';

    const y = Math.sin(lon2 - lon1) * Math.cos(lat2);
    const x = (Math.cos(lat1) * Math.sin(lat2)) -
              (Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1));
    const degrees = this.radiansToDegrees(Math.atan2(y, x));

    return {
      degrees,
      compass: `${NS}${EW}`
    };
  }

  /**
   * Determines if a pair of longitude points crosses over the antemeridian, which is a
   * pain point for mapping software.
   */
  crossesAntemeridian(longitude1, longitude2) {
    if (!longitude1 || !longitude2) return false;

    const isLong1Positive = isPositive(longitude1);
    const isLong2Positive = isPositive(longitude2);
    const haveSameSigns = isLong1Positive === isLong2Positive;

    if (haveSameSigns) return false;

    // Signs don't match, so check if we're reasonably near the antemeridian (just to be sure it's
    // not the prime meridian).
    const isNearAntemeridian = Math.abs(longitude1) > 100;

    return isNearAntemeridian;
  }

  /**
   * Determines a set of three orbit ground tracks.  Similar to getGroundTrackLatLng, except
   * points are returned in reversed order ([longitude, latitude]), which is handy for GeoJSON.
   */
  getGroundTrackLngLat(tle, stepMS, optionalTimeMS) {
    const latLngArr = this.getGroundTrackLatLng(tle, stepMS, optionalTimeMS);
    const lngLatArr = latLngArr.map(line => line.map(latLng => [latLng[1], latLng[0]]));

    return lngLatArr;
  }
}