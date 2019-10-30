// DATA
var collection = ee.ImageCollection("UCSB-CHG/CHIRPS/DAILY");

// Define time range
var startyear = 1981;
var endyear = 2018;

var startmonth = 1 
var endmonth = 12  

// Set date in ee date format
var startdate = ee.Date.fromYMD(startyear,startmonth,1);
var enddate = ee.Date.fromYMD(endyear,endmonth,31);

// create list for years
var years = ee.List.sequence(startyear,endyear);

// create list for months
var months = ee.List.sequence(startmonth,endmonth);

// Filter data
var datain = collection.filterDate(startdate, enddate)
  .filter(ee.Filter.calendarRange(startmonth,endmonth, 'month'))
  // Sort chronologically in descending order.
  // .sort('system:time_start', false)
  // .filterBounds(ROI)
  .map(function(img){
    return img.addBands(ee.Image(0).uint8().rename('counter'))
  });

var precipThresh = 0.1; // mm

function drySpells(img, list){
  // get previous image
  var prev = ee.Image(ee.List(list).get(-1));
  // find areas gt precipitation threshold (gt==0, lt==1)
  var dry = img.select('precipitation').lt(precipThresh);
  // add previous day counter to today's counter
  var accum = prev.select('counter').add(dry).rename('counter');
  // create a result image for iteration
  // precip < thresh will equall the accumulation of counters
  // otherwise it will equal zero
  var out = img.select('precipitation').addBands(
        img.select('counter').where(dry.eq(1),accum)
      ).uint8();
  return ee.List(list).add(out);
}

// create first image for iteration
var first = ee.List([ee.Image(datain.first())]);

// calculate the annual max dryspell
var YY_maxDrySpell =  ee.ImageCollection.fromImages(
  years.map(function (y) {
      var w = datain.filter(ee.Filter.calendarRange(y, y, 'year'))
      var w1 = ee.ImageCollection.fromImages(w.iterate(drySpells,first)).max()
    return w1.set('year', y)
}).flatten()).select('counter');

// calculate monthly max dryspell

var byMonth = ee.ImageCollection(ee.FeatureCollection(years.map(function(y){
  
  var yearCollection = datain.filter(ee.Filter.calendarRange(y, y, 'year'));
  
  var byYear = ee.ImageCollection.fromImages(
    
    months.map(function(m) {
      
      var w = yearCollection.filter(ee.Filter.calendarRange(m, m, 'month'))
      
      var w1 = ee.ImageCollection.fromImages(w.iterate(drySpells,first)).max()
                
      
      
     
      return w1.set('system:time_start', ee.Date.fromYMD(y, m, 1));
     
  }));
 
  return byYear;
  
})).flatten()).select('counter');

var outputbyMonth = byMonth.filter(ee.Filter.listContains('system:band_names', 'constant').not())

                    .sort('system:time_start').toBands();
                    
print(outputbyMonth,'Monthly_maxDrySpell')

var reducers = ee.Reducer.mean().combine({
 
  reducer2: ee.Reducer.stdDev(),
  
  sharedInputs: true
  
});

var zonaloutputbyMonth = outputbyMonth.reduceRegions({
  
  collection: table, // Zones by which to calculate zonal statistics from the outputbyMonth image
  
  reducer: reducers, // Calculate pixel value mean and standard deviation within each district for every month
  
  scale: 5566 // The resolution of the CHIRPS 2.0 dataset in meters
  
});

// Print zonalPrecip to Console

print("Zonal statistics: mean and standard deviation", zonaloutputbyMonth);

var sum_prefix = ""


Export.table.toDrive({
  
  collection: zonaloutputbyMonth,
  
  description: sum_prefix,
  
  folder: "",
  
  fileNamePrefix : sum_prefix,
  
  fileFormat: 'CSV'
  
});      
