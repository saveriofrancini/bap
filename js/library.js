// BAP____________________________________________________________________________________________________________
exports.doc = 'This is the BAP library';

// getCollection functions________________________________________________________________________________________
var cloudMask = function(img, sensor){
  img = ee.Image(img);
  var cloudM;

    var qualityBand = img.select('pixel_qa');
    var shadow = qualityBand.bitwiseAnd(8).neq(0);  // get the areas containing shadows (bitwiseAnd checks wheter the quality band contains the bit 3 (2^3 = 8))
    var cloud = qualityBand.bitwiseAnd(32).neq(0);  // get the areas containing clouds 
    
    // Cloud confidence is comprised of bits 6-7.
    // Add the two bits and interpolate them to a range from 0-3.
    // 0 = None, 1 = Low, 2 = Medium, 3 = High.
    var cloudConfidence = qualityBand.bitwiseAnd(64)
        .add(qualityBand.bitwiseAnd(128))
        .interpolate([0, 64, 128, 192], [0, 1, 2, 3], 'clamp').int();
    var cloudConfidenceMediumHigh = cloudConfidence.gte(2); 

    cloudM = shadow.or(cloud).or(cloudConfidenceMediumHigh) // not swaps 0 and 1 values (required for .map to work properly)
                                          .select([0], ['cloudM']);
    
    // add cirrus confidence to cloud mask (cloudM)
    if(sensor === 'LC08'){
      var cirrusConfidence = qualityBand.bitwiseAnd(256)
        .add(qualityBand.bitwiseAnd(512))
        .interpolate([0, 256, 512, 768], [0, 1, 2, 3], 'clamp').int();
      var cirrusConfidenceMediumHigh = cirrusConfidence.gte(2); 
      cloudM = cloudM.or(cirrusConfidenceMediumHigh);
    }
    
    cloudM = cloudM.not();  // not required to swap 0 and 1 (so clouds have number 0)

  // mask image with cloud mask
  var imageCloudMasked = img.mask(img.mask(cloudM));  // second mask removes places where cloudM has zeroes (needed to avoid strips between sentinel scenes)
                                      
  // add cloud mask as band
  imageCloudMasked = imageCloudMasked.addBands(cloudM);
  
  return imageCloudMasked;
};
exports.cloudMask = cloudMask;

var FilterAndAddSensorBands = function(I_aoi, sensor, I_cloudThreshold, SLCoffPenalty){

var collection = ee.ImageCollection('LANDSAT/'+sensor+'/C01/T1_SR');

  var bands;
  var SensorBand;
  var collectionFiltered;
  if (sensor == 'LT05'){
    bands = ['B1',   'B2',    'B3',  'B4',  'B5',  'B7', 'pixel_qa', 'sr_atmos_opacity'];
    SensorBand = 5;
    collectionFiltered = collection.filterMetadata('CLOUD_COVER', 'less_than', I_cloudThreshold)
    .select(bands, ['blue', 'green', 'red', 'nir', 'swir1', 'swir2', 'pixel_qa', "opacity"]);
  }
  if (sensor == 'LE07'){
    bands = ['B1',   'B2',    'B3',  'B4',  'B5',  'B7', 'pixel_qa', 'sr_atmos_opacity'];
    SensorBand = 7;
    collectionFiltered = collection.filterMetadata('CLOUD_COVER', 'less_than', I_cloudThreshold)
    .select(bands, ['blue', 'green', 'red', 'nir', 'swir1', 'swir2', 'pixel_qa', "opacity"]);
  }
  if (sensor == 'LC08'){
    bands = ['B2',   'B3',    'B4',  'B5',  'B6',  'B7', 'pixel_qa'];
    SensorBand = 8;
    collectionFiltered = collection.filterMetadata('CLOUD_COVER', 'less_than', I_cloudThreshold)
    .select(bands, ['blue', 'green', 'red', 'nir', 'swir1', 'swir2', 'pixel_qa',]);
    // add dummy opacity band
    collectionFiltered = collectionFiltered.map(function(img){
      return img.addBands(ee.Image(250).int16().rename(["opacity"]));
    });
  }
  
  if(I_aoi !== null){
    collectionFiltered = collectionFiltered.filterBounds(ee.FeatureCollection(I_aoi));
  }
  
   // Add a band with the sensor on each image in the image collection
   var collectionFilteredWithSensor = collectionFiltered.map(function(image){
   image = ee.Image(image);
   var SensorImage = ee.Image(SensorBand).select([0], ['sensor']).int16();
   return image.addBands(SensorImage);
   });
 
   // Add band with sensorWeight
   var collectionFilteredWithSensorAndSensorWeight;
   
   // prepare SLCoff score
   var SLCoffScore = ee.Number(1000).subtract(ee.Number(SLCoffPenalty).multiply(1000));
   
   if (sensor == 'LE07'){
     
   // note that sensor weights are muptiplied by 10 here to obatin int16() bands
   // Will be rescaled before the final score calculation
   var SLCoffCollection = collectionFilteredWithSensor.filter(ee.Filter.date('2003-05-31', "2030-01-01"));
   var SLConCollection = collectionFilteredWithSensor.filter(ee.Filter.date('1984-01-01', '2003-05-31'));

   SLConCollection = SLConCollection.map(function(image){
   image = ee.Image(image);
   var SensorWeightImage = ee.Image(1000).select([0], ['sensorScore']).int16();
   return image.addBands(SensorWeightImage);
   });
   
   SLCoffCollection = SLCoffCollection.map(function(image){
   image = ee.Image(image);
   var SensorWeightImage = ee.Image(SLCoffScore).select([0], ['sensorScore']).int16();
   return image.addBands(SensorWeightImage);
   });

   collectionFilteredWithSensorAndSensorWeight = SLCoffCollection.merge(SLConCollection);
 
   }else{
     
   collectionFilteredWithSensorAndSensorWeight = collectionFilteredWithSensor.map(function(image){
   image = ee.Image(image);
   var SensorWeightImage = ee.Image(1000).select([0], ['sensorScore']).int16();
   return image.addBands(SensorWeightImage);
   });
   
   }
  
  return ee.ImageCollection(collectionFilteredWithSensorAndSensorWeight);
};
exports.FilterAndAddSensorBands = FilterAndAddSensorBands;

var getCollection = function(I_aoi, I_cloudThreshold, SLCoffPenalty){
  
    // create collections
    var LT5 = FilterAndAddSensorBands(I_aoi, 'LT05', I_cloudThreshold, SLCoffPenalty); 
    var LE7 = FilterAndAddSensorBands(I_aoi, 'LE07', I_cloudThreshold, SLCoffPenalty);
    var LC8 = FilterAndAddSensorBands(I_aoi, 'LC08', I_cloudThreshold, SLCoffPenalty);
    
    // remove clouds
    var LT5cloudsMasked = LT5.map(function(image){return cloudMask(image, 'LT05')}); 
    var LE7cloudsMasked = LE7.map(function(image){return cloudMask(image, 'LE07')}); 
    var LC8cloudsMasked = LC8.map(function(image){return cloudMask(image, 'LC08')}); 
    
    return ee.ImageCollection(LT5cloudsMasked.merge(LE7cloudsMasked).merge(LC8cloudsMasked));

};
exports.getCollection = getCollection;

// createBAPcomposites functions__________________________________________________________________________________
var calculateCloudWeightAndDist = function(imageWithCloudMask, cloudDistMax){

  var cloudM = imageWithCloudMask.select('cloudM').unmask(0).eq(0);
  var nPixels = ee.Number(cloudDistMax).divide(30).toInt();
  var cloudDist = cloudM.fastDistanceTransform(nPixels, "pixels",  'squared_euclidean');
  // fastDistanceTransform max distance (i.e. 50*30 = 1500) is approzimate. Correcting it...
  cloudDist = cloudDist.where(cloudDist.gt(ee.Image(cloudDistMax)), cloudDistMax);
  
  var deltaCloud = ee.Image(1).toDouble() .divide((ee.Image(ee.Number(-0.008))
  .multiply(cloudDist.subtract(ee.Number(cloudDistMax/2)))).exp().add(1))
  .unmask(1)
  .select([0], ['cloudScore']);
  
  cloudDist = ee.Image(cloudDist).int16().rename('cloudDist');

  var keys = ['cloudScore', 'cloudDist'];
  var values = [deltaCloud, cloudDist]; 
  
  return ee.Dictionary.fromLists(keys, values);
};
exports.calculateCloudWeightAndDist = calculateCloudWeightAndDist;

var calculateOpacityWeight = function(imageWithOpacityBand, opacityScoreMin, opacityScoreMax){

  var opacity = imageWithOpacityBand.select('opacity').multiply(0.001);

  var opacityScore = ee.Image(1).subtract(ee.Image(1).divide(ee.Image(1).add(
  ee.Image(-0.2).multiply(opacity.subtract(ee.Image(0.05))).exp() // (300-200)/2
  )));
    
  // opacity smaller than 0.2 -> score = 1
  opacityScore = opacityScore.where(opacity.lt(ee.Image(opacityScoreMin)), 1); // opacityScoreMin = 0.2
  // opacity larger than 0.3 -> score = 0
  opacityScore = opacityScore.where(opacity.gt(ee.Image(opacityScoreMax)), 0); // opacityScoreMax = 0.3
  //return opacity.rename(["opacityScore"]);
  return opacityScore.rename(["opacityScore"]);
};
exports.calculateOpacityWeight = calculateOpacityWeight;

var calculateDayWeightAndDoy = function(image, I_targetDay){
  image = ee.Image(image);
  
  var Year_i = image.date().get("year");
  var targetDate =  ee.Date(ee.String(ee.Number(Year_i))
                    .cat(ee.String("-"))
                    .cat(ee.String(I_targetDay)));
  var eeDateImage = ee.Date(image.get('system:time_start'));
  
  var deltaDay = ((ee.Number(0.01049848)) // 95.25187 = 38*sqrt(pi*2)
 .multiply(ee.Number(Math.E).pow(ee.Number(-0.5)
 .multiply (((eeDateImage.difference(targetDate, 'day')).divide(38)).pow(2)))))
 .divide(0.01049848); // 0.01049848 = maximum score achievable; 

  // create doy band
  var dayOfYearImage = eeDateImage.getRelative('day', 'year');
  
  var doy = ee.Image(1).add(dayOfYearImage)
                       .mask(image.select('cloudM')) // mask clous pixels
                       .int16().select([0], ['doy']);
  
  // deltaDayImg
  var deltaDayImg = ee.Image(deltaDay).rename(["doyScore"]);
  
  var keys = ['doyScore', 'doy'];
  
  // convert delta Day to image and add 
  var values = [deltaDayImg, doy];  
  
  return ee.Dictionary.fromLists(keys, values);
};
exports.calculateDayWeightAndDoy = calculateDayWeightAndDoy;

var addWeightBandsToCollection = function(collection, I_targetDay, opacityScoreMin, opacityScoreMax, cloudDistMax){

  // returns an image with the delta (quality) band.
  var addDoyAndDeltaBandToImage = function(image){   
  image = ee.Image(image);

  // distance to I_targetDay 
  var deltaDayAndDoy = calculateDayWeightAndDoy(image, I_targetDay);
  var doy = ee.Image(deltaDayAndDoy.get('doy'));
  var doyScore = ee.Image(deltaDayAndDoy.get('doyScore'));
  
  // opacity score
  var opacityScore = calculateOpacityWeight(image, opacityScoreMin, opacityScoreMax);
  // mask the image where the opacity score is 0
  image = image.updateMask(opacityScore);
  
  // cloud distance
  var deltaCloudAndDist = calculateCloudWeightAndDist(image, cloudDistMax); 
  var cloudDist = ee.Image(deltaCloudAndDist.get('cloudDist'));
  var cloudScore = ee.Image(deltaCloudAndDist.get('cloudScore'));
  
  // sensor weight
  var deltaSensor = ee.Image(image.select('sensorScore'));
  
  // create delta band based on weights
  var score = doyScore
         .add(cloudScore)
         .add(deltaSensor.divide(1000)) // rescaled. see FilterAndAddSensorBands()
         .add(opacityScore)
         .divide(4)
         .multiply(1000)
         .select([0], ['score']).int16();
  
  // Add information bands
  var imageWithBands = image.addBands(doy).addBands(doyScore.multiply(1000)).addBands(cloudDist)
                            .addBands(cloudScore.multiply(1000))
                            .addBands(opacityScore.multiply(1000)).addBands(score);
  
  // Return the image and remove the cloud mask 'cloudM' and pixel_qa
  imageWithBands = imageWithBands.select(['blue', 'green', 'red', 'nir', 'swir1', 'swir2', 
                                          'sensor', 'sensorScore', 'doy', "doyScore", 
                                          'cloudDist', "cloudScore", "opacityScore", 'score']).int16();
  return imageWithBands;
  };

  // apply addDoyAndDeltaBandToImage to each image in collection
  var collectionWithWeightsBands = collection.map(function(image){
                                   return addDoyAndDeltaBandToImage(image);  
                                   });

  return collectionWithWeightsBands;
};
exports.addWeightBandsToCollection = addWeightBandsToCollection;

var createBAPcomposites = function(collection, I_targetDay, I_daysRange, opacityScoreMin, opacityScoreMax, cloudDistMax){   
  
var I_startYear = 1984;                                          
var I_endYear   = 2021; 

  // add day of year and delta (quality) bands to each image of the collection 
  collection = addWeightBandsToCollection(collection, I_targetDay, opacityScoreMin, opacityScoreMax, cloudDistMax);

  // create list of years for which generating the BAP
  var years = ee.List.sequence(I_startYear, I_endYear);

   var filterAndComposite = function(year) {

   var yearString = ee.String(year).slice(0,4);   // remove unnecessary .0 which is added by string conversion

   var I_targetDayAdjusted = ee.Date(yearString.cat('-').cat(ee.String(I_targetDay)));
 
   var startDateWithYear =  I_targetDayAdjusted.advance(-I_daysRange, "day"); 
   var endDateWithYear   =  I_targetDayAdjusted.advance(I_daysRange, "day");

   var filteredCollectionByDate = ee.ImageCollection(collection.filterDate(startDateWithYear, endDateWithYear));

   var dateString = yearString.cat("-").cat(I_targetDay);

   var calculateAndStackComposite = function(filteredCollectionByDate){
     
    filteredCollectionByDate = filteredCollectionByDate
    .map(function(img){return img.updateMask(img.select([0, 1, 2, 3, 4, 5]).reduce(ee.Reducer.min()))});
    // mosaic collection with delta band
    var composite = filteredCollectionByDate.qualityMosaic('score');

    // mask missing values
    // composite = composite.updateMask(composite);
    composite = composite.updateMask(composite.select([0, 1, 2, 3, 4, 5]).reduce(ee.Reducer.min()));

    // select output bands 
    //composite = composite.select(['blue', 'green', 'red', 'nir', 'swir1', 'swir2', 
    //                            'sensor', 'sensorScore', 'doy', "doyScore", 
    //                            'cloudDist', "cloudScore", 'score']).int16();

    //  composite = composite.set('system:time_start', dateString);
    composite = composite.set({
      'system:time_start': ee.Date(dateString).millis(),
      'system:id': dateString
      });
    return composite;
   };// end calculateAndStackComposite()

   return ee.Algorithms.If(filteredCollectionByDate.size().gt(0),
                           calculateAndStackComposite(filteredCollectionByDate),
    //                       BAPCollection);
    //                           null);
    ee.Image.cat(0,0,0,0,0,0,0,0,0,0,0,0,0,0).int16()
    .rename(['blue', 'green', 'red', 'nir', 'swir1', 'swir2', 'sensor', 'sensorScore', 
             'doy', "doyScore", 'cloudDist', "cloudScore", "opacityScore", 'score'])
             .set({'system:time_start': ee.Date(dateString).millis(),'system:id': dateString})
                                );

    };
  
  //var out = years.iterate(filterAndComposite, BAPCollection);
  var out = years.map(filterAndComposite);
  
  return ee.ImageCollection(out);
};
exports.createBAPcomposites = createBAPcomposites;

var BAP = function(I_aoi, I_targetDay, I_daysRange, I_cloudThreshold, 
                   SLCoffPenalty, opacityScoreMin, opacityScoreMax, cloudDistMax){
                     
  var collection = getCollection(I_aoi, I_cloudThreshold, SLCoffPenalty, opacityScoreMin, opacityScoreMax);
  return createBAPcomposites(collection, I_targetDay, I_daysRange, opacityScoreMin, opacityScoreMax, cloudDistMax);
  
};
exports.BAP = BAP;




// Despike function_______________________________________________________________________________________________
var despikeCollection = function (DespikeThreshold, NbandsThreshold, collection, I_startYear, I_endYear, I_maskSpikes){

    // select Landsat bands to detect outliers and spikes
    // collection = collection.select([0, 1, 2, 3, 4, 5]);

    // count the number of images in the collection
    var nImages = (I_endYear-I_startYear)+1;

    // Produce a list -> 1:(nImages-2) 
    // This list exclude the first (0) and the last (nImages-1) images
    var ImagesToDespikeList = ee.List.sequence(1, nImages-2);
    
    // Convert image collection into list to get elements iteratively
    var collectionList = collection.toList(nImages);
 
       // DespikeImage function
       var DespikeImage = function(nImg){
       
          // to ee object
          var nImgEE = ee.Number(nImg);
          var oneEE  = ee.Number(1);
         
          // for each image (ImgY) three images are required:
          var ImgYbefore = ee.Image(collectionList.get(nImgEE.subtract(oneEE))).int16().select([0, 1, 2, 3, 4, 5]); 
          var ImgY = ee.Image(collectionList.get(nImgEE)).int16().select([0, 1, 2, 3, 4, 5]);
          var ImgYafter = ee.Image(collectionList.get(nImgEE.add(oneEE))).int16().select([0, 1, 2, 3, 4, 5]);
          
          // Despike conditions
          // #1# "The value of the spilke detected in that band is greater than 100"
          var spike_value = ImgY.subtract(ImgYbefore.add(ImgYafter).divide(2)).abs();
          var condition1 = spike_value.gt(100);
          
          // #2# "spikes are dampened if the spectral value difference between spectral values on either side 
          // of the spike is less than 1-despike desawtooth proportion of the spike itself" (Landtrendr)
          var despikeProportion = ImgYbefore.subtract(ImgYafter).abs().divide(spike_value);
          var condition2 = despikeProportion.lt(ee.Image(1).subtract(DespikeThreshold));
          
          // #3# The number of bands in which condition 1 AND 2 are meet is greater than NbandsThreshold
          var condition1ANDcondition2 = condition1.and(condition2);
          var nBandsInWhichcondition1ANDcondition2 = condition1ANDcondition2.reduce(ee.Reducer.sum());
          var detectedSpiked = nBandsInWhichcondition1ANDcondition2.gte(NbandsThreshold).rename('spikes')
                               // remove from the final noise mask pixels missing in the years before or later
                               .updateMask(ImgYbefore.select([0]).unmask(0))
                               .updateMask(ImgYafter.select([0]).unmask(0));
         
          // Prepare a cloudMask
          var cloudMask = ImgY.select(["red"]).unmask(0);
          
          if(I_maskSpikes===true){
          // noiseLayer
          var despikeMask = detectedSpiked.unmask(0).eq(0); // invert 0 and 1
          // Apply the noiseLayer 
          ImgY = ee.Image(collectionList.get(nImgEE)).int16().updateMask(despikeMask);
          }

          // produce an image to point the despiked pixels: 1 = despiked, 0 = validpixels, 2 = clouds
          var noiseLayer = detectedSpiked.unmask(0).updateMask(cloudMask).unmask(2).int16().rename('noiseLayer');
          
          return ImgY.addBands(noiseLayer);
    };
    
    // Apply DespikeImage function over the collection
    var DespikedCollection =  ee.ImageCollection(ImagesToDespikeList.map(DespikeImage));
    
    // Add first and last images 
    var firstImage = ee.Image([collectionList.get(ee.Number(0))]);
    var firstImageNoiseLayer = firstImage.select([0]).unmask(0).eq(0).multiply(2).int16().rename("noiseLayer");
    firstImage = firstImage.addBands(firstImageNoiseLayer); 
    var lastImage = ee.Image([collectionList.get(ee.Number(nImages-1))]);
    var lastImageNoiseLayer = lastImage.select([0]).unmask(0).eq(0).multiply(2).int16().rename("noiseLayer");
    lastImage = lastImage.addBands(lastImageNoiseLayer); 
    
    return ee.ImageCollection(firstImage).merge(DespikedCollection).merge(lastImage);
  };
exports.despikeCollection = despikeCollection; 

// calculateProxyCollection________________________________________________________________________
var infill = function(collection, I_startYear, I_endYear, image, justFill){
  // collection must have a "noiseLayer" band in which "0" points valid observations
  // the first band of imagery in collection must be the year
  // image may have as many bands as many imagery are in collection
  // Each band should be a mask pointing with values greather than 0
  // pixels that should be used to interpolate (e.g. the C2C "duration" band)
  // if img = false a linear interpolation is performed
  // if justFill = true the function is applied just on data gaps. 
  var bandNames = collection.first().select([0, 1, 2, 3, 4, 5]).bandNames();
  collection2 = collection.map(function(img){
  var yr = ee.Image(ee.Date(img.get('system:time_start')).get("year"))
                     .select([0], ['year']) 
                     .int16()
                     .set('system:time_start', img.get('system:time_start'))
                     .set('system:id', img.get('system:id'));
  return yr.addBands(img);
  }); // add year band
  var maskCollection = function(collection, image){
  var collectionList = collection.toList(9999);
  var ids = ee.List.sequence(1, collectionList.size().subtract(1)); //////
  var maskImage = function(id){
    var img = ee.Image(collectionList.get(id));
    var mask = ee.Image(image.select([id]));
    return img.updateMask(mask);
  };
  return ee.ImageCollection(collection.first())
  .merge(ee.ImageCollection(ids.map(maskImage))); /////////
}; // mask collection using image function
  if (image !== false){
  var collection2 = maskCollection(collection2, image); // use maskCollection()
  }
  var linearInterpolation = function(year){
    year = ee.Number(year);
    var currentImage         = collection.filter(ee.Filter.calendarRange(year, year, "year")).first();
    var previousCollection   = collection2.filter(ee.Filter.calendarRange(I_startYear, year.subtract(1), "year"));
    var subsequentCollection = collection2.filter(ee.Filter.calendarRange(year.add(1), I_endYear, "year"));
    var beforeImage          = previousCollection.reduce(ee.Reducer.lastNonNull());
    var nextImage            = subsequentCollection.reduce(ee.Reducer.firstNonNull());
    var difference = nextImage.select([1, 2, 3, 4, 5, 6]).subtract(beforeImage.select([1, 2, 3, 4, 5, 6]));
    var yearsProp = (ee.Image(year).subtract(beforeImage.select([0])))
    .divide(nextImage.select([0]).subtract(beforeImage.select([0])));
    var proxyImage = beforeImage.select([1, 2, 3, 4, 5, 6]).add(difference.multiply(yearsProp)).rename(bandNames);
    if (justFill){
    return currentImage.select(0, 1, 2, 3, 4, 5).unmask(0).where(currentImage.select(["noiseLayer"]).neq(0), proxyImage)
    .set('system:time_start', currentImage.get('system:time_start'))
    .set('system:id', ee.String(year).slice(0,4));
    }else{
    return proxyImage.set('system:time_start', currentImage.get('system:time_start'))
    .set('system:id', ee.String(year).slice(0,4));
    }
    };
  var linearInterpolated = ee.ImageCollection(ee.List.sequence(I_startYear+1, I_endYear-1).map(linearInterpolation));
  var firstImage = collection.filter(ee.Filter.calendarRange(I_startYear, I_startYear, "year")).first()
  .set('system:id', ee.String(ee.Number(I_startYear)).slice(0,4));
  var lastImage  = collection.filter(ee.Filter.calendarRange(I_endYear, I_endYear, "year")).first()
  .set('system:id', ee.String(ee.Number(I_endYear)).slice(0,4));
  var firstExtrapolated = firstImage.select([0, 1, 2, 3, 4, 5]).unmask(0)
  .where(firstImage.select(["noiseLayer"]).neq(0), linearInterpolated.reduce(ee.Reducer.firstNonNull()));
  var lastExtrapolated = lastImage.select([0, 1, 2, 3, 4, 5]).unmask(0)
  .where(lastImage.select(["noiseLayer"]).neq(0), linearInterpolated.reduce(ee.Reducer.lastNonNull()));
  return ee.ImageCollection(firstExtrapolated).merge(linearInterpolated).merge(lastExtrapolated);
  
};
exports.infill = infill; 

// Function to calculate several indices and select bands_________________________________________________________
var SelectBandsAndAddIndices = function(collection, index, reverseIndex, skipeNoiseLayer){

var SelectBandsAndAddIndicesImg = function(img){

var imgSpectralBands = img.select([0,1,2, 3, 4, 5]);

var out;

if (index == "NDVI"){
var NDVI = imgSpectralBands.normalizedDifference(['nir', 'red']) 
.rename('NDVI') 
.multiply(1000).int16() // to integer
.set('system:time_start', imgSpectralBands.get('system:time_start'))
.set('system:id', imgSpectralBands.get('system:id'));
out = NDVI ;
}

if (index == "EVI"){
 var EVI = ee.Image(0).expression(
 '2.5 * ((float(NIR - RED) / float((NIR) + (6.0 * RED - 7.5 * BLUE) + 1.0)))',{
     'NIR': imgSpectralBands.select('nir'),
     'RED': imgSpectralBands.select('red'),
     'BLUE': imgSpectralBands.select('blue')
 })
 .rename('EVI')
 .multiply(1000).int16() // to integer
 .set('system:time_start', imgSpectralBands.get('system:time_start'))
 .set('system:id', imgSpectralBands.get('system:id'));
 out = EVI ;
}

if (index == "NBR"){
    var nbr = imgSpectralBands.normalizedDifference(['nir', 'swir2']) 
                 .multiply(1000) // scale results by 1000
                 .select([0], ['NBR']) // name the band
                 .int16() // to integer
                 .set('system:time_start', imgSpectralBands.get('system:time_start'))
                 .set('system:id', imgSpectralBands.get('system:id'));
  // img = img.addBands(nbr);
  out = nbr;
}

if (index == "TCB"){
  var brt_coeffs = ee.Image.constant([0.2043, 0.4158, 0.5524, 0.5741, 0.3124, 0.2303]); 
  var brightness = imgSpectralBands.multiply(brt_coeffs).reduce(ee.Reducer.sum())
  .rename(["TCB"]).int16() // to integer
                     .set('system:time_start', imgSpectralBands.get('system:time_start'))
                     .set('system:id', imgSpectralBands.get('system:id')); 
  // img = img.addBands(brightness);
  out = brightness;
}

if (index == "TCG"){
  var grn_coeffs = ee.Image.constant([-0.1603, -0.2819, -0.4934, 0.7940, -0.0002, -0.1446]); 
  var greenness = imgSpectralBands.multiply(grn_coeffs).reduce(ee.Reducer.sum()) 
  .rename(["TCG"]).int16() // to integer
                     .set('system:time_start', imgSpectralBands.get('system:time_start'))
                     .set('system:id', imgSpectralBands.get('system:id'));
  // img = img.addBands(greenness);
  out = greenness;
}

if (index == "TCW"){
  var wet_coeffs = ee.Image.constant([0.0315, 0.2021, 0.3102, 0.1594, -0.6806, -0.6109]); 
  var wetness = imgSpectralBands.multiply(wet_coeffs).reduce(ee.Reducer.sum())
  .rename(["TCW"]).int16() // to integer
                     .set('system:time_start', imgSpectralBands.get('system:time_start'))
                     .set('system:id', imgSpectralBands.get('system:id'));
  // img = img.addBands(wetness);
  out = wetness;
}

if (index == "TCA"){
  grn_coeffs = ee.Image.constant([-0.1603, -0.2819, -0.4934, 0.7940, -0.0002, -0.1446]); 
  greenness = imgSpectralBands.multiply(grn_coeffs).reduce(ee.Reducer.sum());  
  brt_coeffs = ee.Image.constant([0.2043, 0.4158, 0.5524, 0.5741, 0.3124, 0.2303]); 
  brightness = imgSpectralBands.multiply(brt_coeffs).reduce(ee.Reducer.sum()); 
  var angle = (greenness.divide(brightness)).atan().multiply(180/Math.PI).multiply(100)
  .rename(["TCA"]).int16() // to integer
                     .set('system:time_start', imgSpectralBands.get('system:time_start'))
                     .set('system:id', imgSpectralBands.get('system:id'));
  // img = img.addBands(angle);
  out = angle;
}

if (index == 'blue') {out = img.select(['blue'])}
if (index == 'green'){out = img.select(['green'])}
if (index == 'red')  {out = img.select(['red'])}
if (index == 'nir')  {out = img.select(['nir'])}
if (index == 'swir1'){out = img.select(['swir1'])}
if (index == 'swir2'){out = img.select(['swir2'])}

if(reverseIndex){
  out = out.multiply(-1).int16();
}

  var yr = ee.Image(ee.Date(img.get('system:time_start')).get("year"))
                     .select([0], ['year']) 
                     .int16()
                     .set('system:time_start', img.get('system:time_start'))
                     .set('system:id', img.get('system:id'));
  
  if(skipeNoiseLayer){
  return ee.Image(yr.addBands(out));
  }else{
  var noiseLayer = img.select(["noiseLayer"]);
  return ee.Image(yr.addBands(out).addBands(noiseLayer));
  }

  };  
return ee.ImageCollection(collection.map(SelectBandsAndAddIndicesImg));

};
exports.SelectBandsAndAddIndices = SelectBandsAndAddIndices; 

// mapping and export functions___________________________________________________________________________________
var ShowCollection = function(collection,I_startYear,I_endYear,I_aoi,I_showMissingData,I_band,minCol,maxCol){
// Create viridis palette
var viridis = [
"#440154FF", "#460A5DFF", "#471366FF", "#481C6EFF", "#482475FF", "#472C7AFF",
"#46337FFF", "#443A84FF", "#414287FF", "#3E4989FF", "#3C508BFF", "#39578CFF",
"#355E8DFF", "#32648EFF", "#306A8EFF", "#2D708EFF", "#2B768EFF", "#287C8EFF",
"#26828EFF", "#24878EFF", "#228D8DFF", "#20938CFF", "#1F998AFF", "#1F9F88FF",
"#20A486FF", "#25AA83FF", "#2AB07FFF", "#32B67AFF", "#3BBB75FF", "#47C06FFF",
"#53C568FF", "#60CA60FF", "#6ECE58FF", "#7DD250FF", "#8CD645FF", "#9CD93BFF",
"#ADDC30FF", "#BDDF26FF", "#CEE11DFF", "#DEE318FF", "#EEE51CFF", "#FDE725FF"
];
// Map.setOptions("HYBRID");
  for (var year_i = I_startYear; year_i <= I_endYear; year_i++){
    var image = collection.filter(
    ee.Filter.calendarRange(ee.Number(year_i), ee.Number(year_i), "year")).first();
    if(I_aoi !== null){image = image.clip(I_aoi)}
    if (I_band=== null){
      if (I_showMissingData){image = image.unmask(0)} // if I_showMissingData = TRUE then use unmask to show missing data as black pixels
      Map.addLayer({"eeObject":image,'visParams': {"bands":['red', 'green', 'blue'],"min":0,"max":2000},"name": String(year_i)});
    }else{
      var idx = image.select(I_band).unitScale(minCol, maxCol);
      Map.addLayer({"eeObject": idx,'visParams': {"palette": viridis},"name": String(year_i)}); 
    }
  } // end loop
};
exports.ShowCollection = ShowCollection;

var Downloadcollection = function(collection,bandsToDownload,I_startYear,I_endYear,region,foldername){
  for (var year_i = I_startYear; year_i <= I_endYear; year_i++) {
    var image = collection.filter(ee.Filter.calendarRange(ee.Number(year_i), ee.Number(year_i), "year")).first();
    if (bandsToDownload!==null){image = image.select(bandsToDownload)}
    var region_info = region.getInfo();
    var dimensions = region_info.bands[0].dimensions[0]+"x"+region_info.bands[0].dimensions[1];
    var crs_transform = region_info.bands[0].crs_transform;
    Export.image.toDrive({image:image.int16(),description:String(year_i),folder:foldername,maxPixels:1e13,
                          dimensions:dimensions,crs:region.projection().crs(),crsTransform:crs_transform});
  }
};
exports.Downloadcollection = Downloadcollection;

var DownloadCollectionAsImage = function(collection, imageAoi, bandName, startYear, endYear, folderName){
collection = collection.filter(ee.Filter.calendarRange(ee.Number(startYear), ee.Number(endYear), "year"));
var bandNames = collection.toList(999).map(function(image){return ee.String(ee.Image(image).get('system:id'))});
var imageToDownload = collection.select([bandName]).toBands().rename(bandNames);
var region_info = imageAoi.getInfo();
var dimensions = region_info.bands[0].dimensions[0]+"x"+region_info.bands[0].dimensions[1];
var crs_transform = region_info.bands[0].crs_transform;
Export.image.toDrive({image: imageToDownload,description: bandName,fileNamePrefix: bandName,folder: folderName,
                        maxPixels: 1e13,dimensions: dimensions,crs: imageAoi.projection().crs(),crsTransform: crs_transform});
// Export.image.toAsset({image: imageToDownload.regexpRename('^(.*)', 'b_$1'),
//                       description: bandName+"ToAssets",
//                       assetId: bandName,
//                       maxPixels: 1e13,
//                       dimensions: dimensions,
//                       crs: imageAoi.projection().crs(),
//                       crsTransform: crs_transform
//                       });
};
exports.DownloadCollectionAsImage = DownloadCollectionAsImage;

// deprecated?
var DownloadImage = function(image, imageAoi, bandNames, filename, folderName){
if (bandNames!==null){image = image.select(bandNames)}
image = image.int16();
var region_info = imageAoi.getInfo();
var dimensions = region_info.bands[0].dimensions[0]+"x"+region_info.bands[0].dimensions[1];
var crs_transform = region_info.bands[0].crs_transform;
Export.image.toDrive({image: image,
                      description: filename,//+"ToDrive",
                      folder: folderName,
                      maxPixels: 1e13,
                      dimensions: dimensions,
                      crs: imageAoi.projection().crs(),
                      crsTransform: crs_transform
                      });
Export.image.toAsset({image: image,
                      description: filename+"ToAssets",
                      assetId: filename,
                      maxPixels: 1e13,
                      dimensions: dimensions,
                      crs: imageAoi.projection().crs(),
                      crsTransform: crs_transform
                      });
};
exports.DownloadImage = DownloadImage;

var AddSLider = function(I_startYear, I_endYear){
// if(ui.root.widgets().length() > 2){ui.root.remove(ui.root.widgets().get(3))}
var header = ui.Label('BAP composites time series', {fontWeight: 'bold', fontSize: 40});
var toolPanel = ui.Panel([header], 'flow');
var nlayers = Map.layers().length();
var slider = ui.Slider({'min':I_startYear,'max': I_endYear,'value': I_startYear,'step': 1,
                        'style': {'width':'200px', 'height':'40px', 'color':'blue'}});
slider.onSlide(function(value) {
  var value_normalized = (value - (I_startYear-1))/(I_endYear-(I_startYear-1));
  var int_value = value_normalized * (nlayers - 1) >> 0;
  Map.layers().get(int_value).setOpacity(1);
  for (var i = int_value + 1; i < nlayers; i++) {
    Map.layers().get(i).setOpacity(0);
}
});
Map.add(slider);
};
exports.AddSLider = AddSLider;

// Use this function so show index time series???
var plotTS = function(image, fit_variable, I_startYear, I_endYear){
if(ui.root.widgets().length() > 3){
ui.root.remove(ui.root.widgets().get(3));
}
Map.style().set('cursor', 'crosshair');
Map.setOptions("HYBRID");
var header = ui.Label('Please click on the map.', {fontWeight: 'bold', fontSize: '16px', color: 'blue'});
var toolPanel = ui.Panel([header], 'flow', {width: '400px'});
Map.onClick(function(coords) {
  var click_point = ee.Geometry.Point(coords.lon, coords.lat);
  Map.addLayer(click_point, {color: 'red'});
  var pixel = ee.Image(image).reduceRegion(ee.Reducer.first(), click_point, 30);
  var year = pixel.get("x");
  var y = ee.Array(pixel.get("y"));
  var y_fitted = ee.Array(pixel.get("y_fitted"));
  var RMSE = ee.Array(pixel.get("RMSE"));
  var vertex = ee.Array(pixel.get("vertex")).multiply(100);
  // var despikedMask = ee.Array(pixel.get("despikedMask"));
  // var yearTot = pixel.get("year");

  var plot1 = ui.Chart.array.values(ee.Array.cat([y, y_fitted], 1), 0, year)
   .setSeriesNames(["y", 'y_fit'])
   .setOptions({
     lineWidth: 3,
     title: 'Temporal Segmentation',
     hAxis: {'title': 'year', 'minValue': I_startYear, 'maxValue': I_endYear},
     vAxis: {'title': fit_variable},
     pointSize: 2,
      series: {
            0: { color: 'pink', lineWidth: 0.1, pointSize: 4 },
            1: { color: 'gold', lineWidth: 2, pointSize: 0 },
          }
     });

toolPanel.widgets().set(1, plot1);
});
ui.root.add(toolPanel);
};
exports.plotTS = plotTS;

// // Test the functions______________________________________________________________________________________________
// var I_aoi = ee.Image('users/sfrancini/C2C/mask_template').geometry().bounds();
// Map.centerObject(I_aoi, 7);
// // I_aoi = null;
// var bapTs = BAP(I_aoi,"12-15",60,70,0.3).aside(print, "BAP time series");
// ShowCollection(bapTs, 1985, 2019, I_aoi, true, null);
// // ShowCollection(C2CBAPtimeSeries, 2019, 2019, I_aoi, true, "doy", 0, 365);
// // AddSLider(1985, 2019);
