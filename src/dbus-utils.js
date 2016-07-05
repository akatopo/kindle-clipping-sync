import R from 'ramda';

const API = {
  getJobProperties,
  getDbusPropertyValue,
  getDbusBuffer,
};

export default API;

export const curried = R.map(R.curry, API);

/////////////////////////////////////////////////////////////

/**
 * get defined properties from a org.freedesktop.UDisks2.Job dbus interface
 * @param  {Array.<string>|string} properties properties to extract
 * @param  {Array.<*>} interfaceMap dbus interface map
 * @return {Object.<string,*>} object with property values mapped to property names
 */
function getJobProperties(properties, interfaceMap) {
  if (interfaceMap[0] !== 'org.freedesktop.UDisks2.Job') {
    throw Error('invalid job interface map');
  }
  const _properties = R.isArrayLike(properties) ? properties : [properties];
  const propertySet = new Set(_properties);

  const pairs = interfaceMap[1]
    .filter((property) => propertySet.has(property[0]))
    .map((property) => [
      property[0].toLowerCase(),
      getDbusPropertyValue(property[1]),
    ]);

  return R.fromPairs(pairs);
}

/**
 * get the property value from dbus property array
 * @param  {Array<Array<*>>} p dbus property array
 * @return {*} dbus property value
 */
function getDbusPropertyValue(p) {
  return p[1][0];
}

/**
 * get a node buffer from a dbus buffer object
 * @param  {{type: string, data: Array.<number>}} dbusBuffer dbus buffer object
 * @return {Buffer} node buffer
 */
function getDbusBuffer(dbusBuffer) {
  if (
    !R.is(Object, dbusBuffer) ||
    dbusBuffer.type !== 'Buffer' ||
    !R.isArrayLike(dbusBuffer.data) ||
    R.last(dbusBuffer.data) !== 0
  ) {
    throw Error('invalid buffer object');
  }

  return new Buffer(dbusBuffer.data.slice(0, -1));
}
