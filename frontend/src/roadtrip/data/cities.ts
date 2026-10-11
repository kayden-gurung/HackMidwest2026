// Bundled city list so suggestions work offline (venue wifi) and never
// return a place we can't route to. Midwest-heavy, plus major US hubs.
const cityList = `
Kansas City, MO|St. Louis, MO|Springfield, MO|Columbia, MO|Jefferson City, MO|Independence, MO|Joplin, MO|St. Joseph, MO|Hannibal, MO|Rolla, MO|Sedalia, MO|Cape Girardeau, MO|Branson, MO|Lee's Summit, MO
Kansas City, KS|Wichita, KS|Topeka, KS|Lawrence, KS|Manhattan, KS|Salina, KS|Overland Park, KS|Emporia, KS|Hutchinson, KS|Dodge City, KS|Abilene, KS|Hays, KS
Omaha, NE|Lincoln, NE|Grand Island, NE|Kearney, NE|North Platte, NE|Nebraska City, NE
Des Moines, IA|Cedar Rapids, IA|Davenport, IA|Iowa City, IA|Sioux City, IA|Council Bluffs, IA|Dubuque, IA|Ames, IA
Oklahoma City, OK|Tulsa, OK|Norman, OK|Stillwater, OK
Little Rock, AR|Fayetteville, AR|Fort Smith, AR|Hot Springs, AR|Bentonville, AR
Chicago, IL|Springfield, IL|Peoria, IL|Champaign, IL|Rockford, IL|Bloomington, IL
Indianapolis, IN|Fort Wayne, IN|Bloomington, IN|South Bend, IN
Louisville, KY|Lexington, KY|Bowling Green, KY
Nashville, TN|Memphis, TN|Knoxville, TN|Chattanooga, TN
Minneapolis, MN|St. Paul, MN|Duluth, MN|Rochester, MN
Milwaukee, WI|Madison, WI|Green Bay, WI
Detroit, MI|Grand Rapids, MI|Ann Arbor, MI|Lansing, MI
Columbus, OH|Cleveland, OH|Cincinnati, OH|Dayton, OH|Toledo, OH
Sioux Falls, SD|Rapid City, SD|Fargo, ND|Bismarck, ND
Denver, CO|Colorado Springs, CO|Boulder, CO|Fort Collins, CO
Dallas, TX|Houston, TX|Austin, TX|San Antonio, TX|Fort Worth, TX|Amarillo, TX|El Paso, TX
Albuquerque, NM|Santa Fe, NM|Phoenix, AZ|Salt Lake City, UT|Las Vegas, NV
Los Angeles, CA|San Francisco, CA|San Diego, CA|Seattle, WA|Portland, OR|Boise, ID
Atlanta, GA|Savannah, GA|Birmingham, AL|Montgomery, AL|New Orleans, LA|Jackson, MS
Charlotte, NC|Raleigh, NC|Asheville, NC|Charleston, SC|Miami, FL|Orlando, FL|Tampa, FL|Jacksonville, FL
Washington, DC|Richmond, VA|Pittsburgh, PA|Philadelphia, PA|New York, NY|Buffalo, NY|Boston, MA
`

export const CITIES: string[] = [
  ...new Set(cityList.split(/[|\n]/).map((c) => c.trim()).filter(Boolean)),
]

export function suggestCities(query: string, limit = 6): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const starts: string[] = []
  const contains: string[] = []
  for (const city of CITIES) {
    const lower = city.toLowerCase()
    if (lower === q) continue
    if (lower.startsWith(q)) starts.push(city)
    else if (lower.split(/[\s,]+/).some((w) => w.startsWith(q))) contains.push(city)
  }
  return [...starts, ...contains].slice(0, limit)
}

export const isKnownCity = (value: string) =>
  CITIES.some((c) => c.toLowerCase() === value.trim().toLowerCase())
