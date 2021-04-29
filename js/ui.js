// Functions
function drawCustomAoi(){
   while (Map.drawingTools().layers().length() > 0) {
    Map.drawingTools().layers().remove(Map.drawingTools().layers().get(0));
   } 
   function f() {
   // Map.onClick();
   // turns drawing off.
   // Map.drawingTools().setShape(null);
   }

 Map.drawingTools().onDraw(ui.util.debounce(f, 500));
 Map.drawingTools().setShape('polygon');
 Map.drawingTools().setLinked(true);
 Map.drawingTools().draw();
}

function loadInputs(){

var u_chooseAoi               = u_chooseAoiCheckSelector         .getValue();
var u_aoiImage                = u_aoiTexbox                      .getValue();
var u_startYear               = u_startYearTexbox                .getValue();
var u_endYear                 = u_endYearTexbox                  .getValue();
var u_targetDay               = u_targetDayTexbox                .getValue();
var u_daysRange               = u_daysRangeTexbox                .getValue();
var u_CloudThreshold          = u_CloudThresholdTexbox           .getValue();
var u_SLCoffPenalty           = u_SLCoffPenaltySlider            .getValue();
var u_opacityScoreMin         = u_opacityScoreMinSlider          .getValue();
var u_opacityScoreMax         = u_opacityScoreMaxSlider          .getValue();
var u_cloudDistMax            = u_cloudDistMaxSlider             .getValue();
var u_despikeThreshold        = u_despikeSlider                  .getValue();
var u_DownloadOutput          = u_DownloadOutputCheckbox         .getValue();
var u_nbandsThreshold         = u_nbandsThresholdTexbox          .getValue();
var u_infillDataGaps          = u_infillDataGapsCheckbox         .getValue();
var u_idx                     = u_ixdSelectorbox                 .getValue();
var u_minCol                  = u_minColSlider                   .getValue();
var u_maxCol                  = u_maxColSlider                   .getValue();
var u_outputFolder            = u_outputFolderTexbox             .getValue();

// adjust inputs
var u_aoi;
if (u_chooseAoi == 'Upload'){
  u_aoiImage = ee.Image(u_aoiImage);
  u_aoi = u_aoiImage.geometry().bounds();  
}else if(u_chooseAoi == 'Global'){
  u_aoi = null; 
}else if(u_chooseAoi == 'Draw'){
  u_aoi = Map.drawingTools().layers().get(0).getEeObject();
}

u_daysRange        = Number(u_daysRange        ); 
u_CloudThreshold   = Number(u_CloudThreshold   );
u_startYear        = Number(u_startYear        );
u_endYear          = Number(u_endYear          );
u_despikeThreshold = Number(u_despikeThreshold );
u_nbandsThreshold  = Number(u_nbandsThreshold  );
u_SLCoffPenalty    = Number(u_SLCoffPenalty    );
u_minCol           = Number(u_minCol           );
u_maxCol           = Number(u_maxCol           );
u_opacityScoreMin  = Number(u_opacityScoreMin  );
u_opacityScoreMax  = Number(u_opacityScoreMax  );
u_cloudDistMax     = Number(u_cloudDistMax     );

  return { 
          u_chooseAoi              : u_chooseAoi,
          u_aoiImage               : u_aoiImage,
          u_aoi                    : u_aoi,
          u_startYear              : u_startYear,
          u_endYear                : u_endYear,
          u_targetDay              : u_targetDay,
          u_daysRange              : u_daysRange,
          u_CloudThreshold         : u_CloudThreshold,
          u_DownloadOutput         : u_DownloadOutput,
          u_despikeThreshold       : u_despikeThreshold,
          u_nbandsThreshold        : u_nbandsThreshold,
          u_infillDataGaps         : u_infillDataGaps,
          u_SLCoffPenalty          : u_SLCoffPenalty,
          u_opacityScoreMin        : u_opacityScoreMin,
          u_opacityScoreMax        : u_opacityScoreMax,
          u_cloudDistMax           : u_cloudDistMax,
          u_idx                    : u_idx,
          u_minCol                 : u_minCol,
          u_maxCol                 : u_maxCol,
          u_outputFolder           : u_outputFolder
          };

}

function runBAP(){
  var Inputs = loadInputs();
  print(Inputs);
  var library = require("users/sfrancini/bap:library"); 
  if(Inputs.u_chooseAoi!="Global"){Map.centerObject(Inputs.u_aoi, 8)}
  var BAPCS = library.BAP(null, Inputs.u_targetDay, Inputs.u_daysRange, Inputs.u_CloudThreshold, Inputs.u_SLCoffPenalty, Inputs.u_opacityScoreMin, Inputs.u_opacityScoreMax, Inputs.u_cloudDistMax);
  BAPCS = library.despikeCollection(Inputs.u_despikeThreshold, Inputs.u_nbandsThreshold, BAPCS, 1984, 2021, true);
  if (Inputs.u_infillDataGaps){BAPCS =  library.infill(BAPCS, 1984, 2021, false, true);}
  if(Inputs.u_idx != "none"){ 
    BAPCS = library.SelectBandsAndAddIndices(BAPCS, Inputs.u_idx, false, true);
    BAPCS = BAPCS.select(Inputs.u_idx);
    library.ShowCollection(BAPCS, Inputs.u_startYear, Inputs.u_endYear, Inputs.u_aoi, 
    true, Inputs.u_idx, Inputs.u_minCol, Inputs.u_maxCol);
    if(Inputs.u_DownloadOutput){
      Export.table.toDrive({
      collection: ee.FeatureCollection(ee.Feature(null, Inputs)),
      description: "inputParameters", folder: Inputs.u_outputFolder});
      if(Inputs.u_chooseAoi != 'Draw'){
        library.DownloadCollectionAsImage(BAPCS, Inputs.u_aoiImage, Inputs.u_idx, Inputs.u_startYear, Inputs.u_endYear, Inputs.u_outputFolder);
      }else{
        BAPCS = BAPCS.filter(ee.Filter.calendarRange(ee.Number(Inputs.u_startYear), ee.Number(Inputs.u_endYear), "year"));
        var bandNames = BAPCS.toList(999).map(function(image){return ee.String(ee.Image(image).get('system:id'))});
        var imageToDownload = BAPCS.select([Inputs.u_idx]).toBands().rename(bandNames);
        Export.image.toDrive({image: imageToDownload,description: Inputs.u_idx,fileNamePrefix: Inputs.u_idx,folder: Inputs.u_outputFolder,
        maxPixels: 1e13, region: geometry, scale:30});
      }
    }
  }else{
  library.ShowCollection(BAPCS, Inputs.u_startYear, Inputs.u_endYear, Inputs.u_aoi, true, null);
  if(Inputs.u_DownloadOutput){
  Export.table.toDrive({
  collection: ee.FeatureCollection(ee.Feature(null, Inputs)),
  description: "inputParameters",
  folder: Inputs.u_outputFolder
  });
  var bandsToDownload = [0, 1, 2, 3, 4, 5]; // to download even BAP scores use var bandsToDownload = null 
  if(Inputs.u_chooseAoi != 'Draw'){
  library.Downloadcollection(BAPCS, bandsToDownload, Inputs.u_startYear, Inputs.u_endYear, Inputs.u_aoiImage, Inputs.u_outputFolder);
  }else{
    for (var year_i = Inputs.u_startYear; year_i <= Inputs.u_endYear; year_i++) {
      var image = BAPCS.filter(ee.Filter.calendarRange(ee.Number(year_i), ee.Number(year_i), "year")).first();
      if (bandsToDownload!==null){image = image.select(bandsToDownload)}
      Export.image.toDrive({image: image.int16(),description: String(year_i),
      folder: Inputs.u_outputFolder, maxPixels: 1e13, region: geometry, scale:30});
    }
  }
  }
  }
  if(Inputs.u_startYear!=Inputs.u_endYear){library.AddSLider(Inputs.u_startYear, Inputs.u_endYear)}
}

function removeLayers(){
  // while (Map.drawingTools().layers().length() > 0) {
  // Map.drawingTools().layers().remove(Map.drawingTools().layers().get(0));
  // } 
  Map.clear();
  var widgets = ui.root.widgets();
  if (widgets.length()>3){
  ui.root.remove(ui.root.widgets().get(3));
  }
}

function drawNewStdyArea(){
  if(Map.drawingTools().layers().length() > 0){drawCustomAoi()}
}


// # User Interfaces
//*********************************************************************************
// ## Begin ui stuff
{
  
// Run boxes 
var runBAPbutton = ui.Button('Run BAP');
runBAPbutton.onClick(runBAP);     
var removeLayersButtonBAP = ui.Button('Reset composites');
removeLayersButtonBAP.onClick(removeLayers);
var runDrawNewStdyArea = ui.Button({
  label: 'Reset study area',
  onClick: drawNewStdyArea,
  style: {shown: false}
}); 

// Text boxes
var TitleBAP = ui.Label({value: "BAP", style:{
  backgroundColor : "lightgreen", fontSize: "30px"}});    // title user inputs

var u_startYearTexbox = ui.Select({
  items: [
    {label: '1984',       value: 1984},
    {label: '1985',       value: 1985},
    {label: '1986',       value: 1986},
    {label: '1987',       value: 1987},
    {label: '1988',       value: 1988},
    {label: '1989',       value: 1989},
    {label: '1990',       value: 1990},
    {label: '1991',       value: 1991},
    {label: '1992',       value: 1992},
    {label: '1993',       value: 1993},
    {label: '1994',       value: 1994},
    {label: '1995',       value: 1995},
    {label: '1996',       value: 1996},
    {label: '1997',       value: 1997},
    {label: '1998',       value: 1998},
    {label: '1999',       value: 1999},
    {label: '2000',       value: 2000},
    {label: '2001',       value: 2001},
    {label: '2002',       value: 2002},
    {label: '2003',       value: 2003},
    {label: '2004',       value: 2004},
    {label: '2005',       value: 2005},
    {label: '2006',       value: 2006},
    {label: '2007',       value: 2007},
    {label: '2008',       value: 2008},
    {label: '2009',       value: 2009},
    {label: '2010',       value: 2010},
    {label: '2011',       value: 2011},
    {label: '2012',       value: 2012},
    {label: '2013',       value: 2013},
    {label: '2014',       value: 2014},
    {label: '2015',       value: 2015},
    {label: '2016',       value: 2016},
    {label: '2017',       value: 2017},
    {label: '2018',       value: 2018},
    {label: '2019',       value: 2019},
    {label: '2020',       value: 2020},
    {label: '2021',       value: 2021}
    ]}).setValue(2000);
var u_endYearTexbox   = ui.Select({
  items: [
    {label: '1984',       value: 1984},
    {label: '1985',       value: 1985},
    {label: '1986',       value: 1986},
    {label: '1987',       value: 1987},
    {label: '1988',       value: 1988},
    {label: '1989',       value: 1989},
    {label: '1990',       value: 1990},
    {label: '1991',       value: 1991},
    {label: '1992',       value: 1992},
    {label: '1993',       value: 1993},
    {label: '1994',       value: 1994},
    {label: '1995',       value: 1995},
    {label: '1996',       value: 1996},
    {label: '1997',       value: 1997},
    {label: '1998',       value: 1998},
    {label: '1999',       value: 1999},
    {label: '2000',       value: 2000},
    {label: '2001',       value: 2001},
    {label: '2002',       value: 2002},
    {label: '2003',       value: 2003},
    {label: '2004',       value: 2004},
    {label: '2005',       value: 2005},
    {label: '2006',       value: 2006},
    {label: '2007',       value: 2007},
    {label: '2008',       value: 2008},
    {label: '2009',       value: 2009},
    {label: '2010',       value: 2010},
    {label: '2011',       value: 2011},
    {label: '2012',       value: 2012},
    {label: '2013',       value: 2013},
    {label: '2014',       value: 2014},
    {label: '2015',       value: 2015},
    {label: '2016',       value: 2016},
    {label: '2017',       value: 2017},
    {label: '2018',       value: 2018},
    {label: '2019',       value: 2019},
    {label: '2020',       value: 2020},
    {label: '2021',       value: 2021}
    ]}).setValue(2000);
var u_ixdSelectorbox   = ui.Select({
  items: [
    {label: 'none',  value: "none" },
    {label: 'NDVI',  value: "NDVI" },
    {label: 'EVI',   value: "EVI"  },
    {label: 'NBR',   value: "NBR"  },
    {label: 'TCG',   value: "TCG"  },
    {label: 'TCW',   value: "TCW"  },
    {label: 'TCB',   value: "TCB"  },
    {label: 'TCA',   value: "TCA"  }
    ]}).setValue('none');

var u_targetDayTexbox = ui.Textbox({
  placeholder: 'Target day (e.g. 08-01)',
  value: '08-01',
  style: {width: '155px'}});
  
var u_outputFolderTexbox = ui.Textbox({
  placeholder: 'Output folder (e.g. out)',
  value: 'bapOutputs',
  style: {width: '155px', shown: false}});
  
var u_daysRangeTexbox = ui.Textbox({
  placeholder: 'Day range (e.g. 30)',
  value: 30,
  style: {width: '155px'}});
  
var u_aoiTexbox = ui.Textbox({
  placeholder: 'Area of interest (image)',
  value: 'users/sfrancini/C2C/mask_template',
  style: {shown: true, width: '250px'}
});

var u_SLCoffPenaltySlider = ui.Slider({min: 0, max: 1, value:0.7, step: 0.01, 
style: { width: '165px', backgroundColor : "lightgreen", color: "darkgreen"}});

var u_opacityScoreMinSlider = ui.Slider({min: 0, max: 1, value:0.2, step: 0.01,
style: { width: '165px', backgroundColor : "lightgreen", color: "darkgreen"}});

var u_opacityScoreMaxSlider = ui.Slider({min: 0, max: 1, value:0.3, step: 0.01,
style: { width: '165px', backgroundColor : "lightgreen", color: "darkgreen"}});

u_opacityScoreMinSlider.onChange(function(value){
  var value2 = Number(u_opacityScoreMaxSlider.getValue());
  if(value > value2){
    u_opacityScoreMinSlider.setValue(value2);
  }
});
u_opacityScoreMaxSlider.onChange(function(value){
  var value2 = Number(u_opacityScoreMinSlider.getValue());
  if(value < value2){
    u_opacityScoreMaxSlider.setValue(value2);
  }
});

var u_cloudDistMaxSlider = ui.Slider({min: 0, max: 7500, value:1500, step: 30,
style: { width: '165px', backgroundColor : "lightgreen", color: "darkgreen"}});

var u_despikeSlider = ui.Slider({min: 0, max: 1, step: 0.01, value:1,
style: { width: '165px', backgroundColor : "lightgreen", color: "darkgreen", shown: false}});
var u_nbandsThresholdTexbox = ui.Slider({min: 1, max: 6, value:3, step: 1,
style: { width: '165px', backgroundColor : "lightgreen", color: "darkgreen", shown: false}});

var u_minColSlider = ui.Slider({min: -10000, max: 10000, step: 10, value:0,
style: { width: '195px', backgroundColor : "lightgreen", color: "darkgreen", shown: false}});
var minColLabel = ui.Label({value: "Min index value to visualize as violet", 
                  style:{backgroundColor : "lightgreen", shown: false}});

var u_maxColSlider = ui.Slider({min: -10000, max: 10000, step: 10, value: 800,
style: { width: '195px', backgroundColor : "lightgreen", color: "darkgreen", shown: false}});
var maxColLabel = ui.Label({value: "Max index value to visualize as yellow", 
                  style:{backgroundColor : "lightgreen", shown: false}});

u_ixdSelectorbox.onChange(function(idx){   
                         if(idx!="none"){
                         u_minColSlider.style().set('shown', true);
                         u_maxColSlider.style().set('shown', true);
                         minColLabel.style()   .set('shown', true);
                         maxColLabel.style()   .set('shown', true);
                         }
                         else{
                         u_minColSlider.style().set('shown', false);
                         u_maxColSlider.style().set('shown', false);
                         minColLabel.style()   .set('shown', false);
                         maxColLabel.style()   .set('shown', false);
                         }});

var u_CloudThresholdTexbox = ui.Slider({min: 0, max: 100, value:70, step: 1,
                                   style: { width: '165px', backgroundColor : "lightgreen", color: "blue"}});

var despikeTitle = ui.Label({value: "Spikes tolerance", style:{
  backgroundColor : "lightgreen", shown: false}});
var despikeNbandsTitle = ui.Label({value: "N bands to check spikes condition", style:{
  backgroundColor : "lightgreen", shown: false}});
  
// Check boxes
var despikeCheckbox = ui.Checkbox('Apply de-spiking algorithm', false);
despikeCheckbox.onChange(function(checked){   
                         if(checked){
                           u_despikeSlider.style().set('shown', true);
                           u_despikeSlider.setValue(0.65);
                           u_nbandsThresholdTexbox.style().set('shown', true);
                           despikeTitle.style().set('shown', true);
                           despikeNbandsTitle.style().set('shown', true);
                         }else{
                           u_despikeSlider.style().set('shown', false);
                           u_despikeSlider.setValue(1);
                           u_nbandsThresholdTexbox.style().set('shown', false);
                           despikeTitle.style().set('shown', false);
                           despikeNbandsTitle.style().set('shown', false);
                         }
                       });
var u_DownloadOutputCheckbox = ui.Checkbox({label:'Download images', value:false, style:{shown: true}});
var u_infillDataGapsCheckbox = ui.Checkbox({label: 'Infill data gaps', value: false, style:{shown: true}});

// Check boxes onChange
var showAdvancedOptionsBAPCheckbox = ui.Checkbox('Advanced parameters', false);
showAdvancedOptionsBAPCheckbox.onChange(function(checked){   
                         if(checked){
                           panelAdvancedOptionsBAP.style().set('shown', true); // make advanced options visible
                         }
                         else {
                           panelAdvancedOptionsBAP.style().set('shown', false);
                         }
                       });

var u_chooseAoiCheckSelector = ui.Select({
 items: [
   {label: 'Draw study area', value: "Draw"},
   {label: 'Upload image template ', value: "Upload"},
   {label: 'Work globally', value: "Global"}
   ]}).setValue("Upload");

u_chooseAoiCheckSelector.onChange(function(aoiOption){   
                         if(aoiOption=="Upload"){
                           u_aoiTexbox.style().set('shown', true);
                           u_aoiTexbox.setValue('users/sfrancini/C2C/mask_template');
                           u_DownloadOutputCheckbox.style().set('shown', true);
                           runDrawNewStdyArea.style().set('shown', false);
                           u_DownloadOutputCheckbox.setValue(false);
                           Map.drawingTools().setShape(null);
                         }
                         if(aoiOption=="Global"){
                           u_aoiTexbox.style().set('shown', false);
                           u_aoiTexbox.setValue('none');
                           u_DownloadOutputCheckbox.style().set('shown', false);
                           u_DownloadOutputCheckbox.setValue(false);
                           runDrawNewStdyArea.style().set('shown', false);
                           Map.drawingTools().setShape(null);
                         }
                         if(aoiOption=="Draw"){
                           u_aoiTexbox.style().set('shown', false);
                           u_aoiTexbox.setValue('none');
                           u_DownloadOutputCheckbox.style().set('shown', true);
                           u_DownloadOutputCheckbox.setValue(false);
                           u_aoiTexbox.setValue('Draw');
                           runDrawNewStdyArea.style().set('shown', true);
                           drawCustomAoi();
                         }
                       });
                       
u_DownloadOutputCheckbox.onChange(function(checked){  
  if(checked){
    u_outputFolderTexbox.style().set('shown', true);
  }else{
   u_outputFolderTexbox.style().set('shown', false); 
  }
});



// Advanced options panel
 var panelAdvancedOptionsBAP = ui.Panel({style: {width: '250px', height: '300', shown: false, 
 backgroundColor: "lightgreen", textAlign: "center", whiteSpace: "nowrap"}});

// global BAP panel
var BAPpanel = ui.Panel({style: {width: '300px', backgroundColor: "lightgreen", 
border: '2px solid black', textAlign: "center", whiteSpace: "nowrap", shown: true}});

// adding boxes
BAPpanel.add(TitleBAP);
//BAPpanel.add(ui.Label({value: "Area of interest", style:{
//  backgroundColor : "lightgreen"}}));
BAPpanel.add(ui.Label({value: "Input/Output options", style:{
  backgroundColor : "lightgreen", fontSize: "20px"}}));
BAPpanel.add(u_chooseAoiCheckSelector);
BAPpanel.add(u_aoiTexbox);
BAPpanel.add(runDrawNewStdyArea);
BAPpanel.add(ui.Label({value: "Start year", style:{
  backgroundColor : "lightgreen"}}));
BAPpanel.add(u_startYearTexbox);
BAPpanel.add(ui.Label({value: "End year", style:{
  backgroundColor : "lightgreen"}}));
BAPpanel.add(u_endYearTexbox);
BAPpanel.add(u_DownloadOutputCheckbox);
BAPpanel.add(u_outputFolderTexbox);

BAPpanel.add(ui.Label({value: "Pixel scoring options", style:{
  backgroundColor : "lightgreen", fontSize: "20px"}}));
BAPpanel.add(ui.Label({value: "Acquisition day of year", style:{
  backgroundColor : "lightgreen"}}));
BAPpanel.add(u_targetDayTexbox);
BAPpanel.add(ui.Label({value: "Day range", style:{
  backgroundColor : "lightgreen"}}));
BAPpanel.add(u_daysRangeTexbox);
BAPpanel.add(ui.Label({value: "Max cloud cover in scene", style:{
  backgroundColor : "lightgreen"}}));
BAPpanel.add(u_CloudThresholdTexbox);
BAPpanel.add(ui.Label({value: "Landsat-7 ETM+ SLC-off penalty", style:{
  backgroundColor : "lightgreen"}}));
BAPpanel.add(u_SLCoffPenaltySlider);
BAPpanel.add(ui.Label({value: "Min opacity", style:{
  backgroundColor : "lightgreen"}}));
BAPpanel.add(u_opacityScoreMinSlider);
BAPpanel.add(ui.Label({value: "Max opacity", style:{
  backgroundColor : "lightgreen"}}));
BAPpanel.add(u_opacityScoreMaxSlider);
BAPpanel.add(ui.Label({value: "Distance to clouds and cloud shadows (km)", style:{
  backgroundColor : "lightgreen"}}));
BAPpanel.add(u_cloudDistMaxSlider);

panelAdvancedOptionsBAP.add(despikeCheckbox);
panelAdvancedOptionsBAP.add(despikeTitle);
panelAdvancedOptionsBAP.add(u_despikeSlider);
panelAdvancedOptionsBAP.add(despikeNbandsTitle);
panelAdvancedOptionsBAP.add(u_nbandsThresholdTexbox);
panelAdvancedOptionsBAP.add(u_infillDataGapsCheckbox);
panelAdvancedOptionsBAP.add(ui.Label({value: "Spectral index", 
style:{backgroundColor : "lightgreen"}}));
panelAdvancedOptionsBAP.add(u_ixdSelectorbox);
panelAdvancedOptionsBAP.add(minColLabel);
panelAdvancedOptionsBAP.add(u_minColSlider);
panelAdvancedOptionsBAP.add(maxColLabel);
panelAdvancedOptionsBAP.add(u_maxColSlider);

BAPpanel.add(showAdvancedOptionsBAPCheckbox);
BAPpanel.add(panelAdvancedOptionsBAP);
//BAPpanel.style({position: "top-left"});
BAPpanel.add(runBAPbutton);
BAPpanel.add(removeLayersButtonBAP);

}
// End ui stuff

// Description panel
{
var descriptionPanel = ui.Panel([
  ui.Label("Welcome to the bap application", {color: "black", fontSize: "14px", backgroundColor: "white"}),
  ui.Label("Here we can add a very short documentation", {color: "black", fontSize: "11px", backgroundColor: "white"}),
  ui.Label("We can add the link for the documentation website", {color: "black", fontSize: "11px", backgroundColor: "white"}),
  ui.Label("documentation", {color: "blue", fontSize: "11px", backgroundColor: "white"}, "https://it.wikipedia.org/wiki/Pippo"),
  ui.Label("___________________________", {color: "black", fontSize: "11px", backgroundColor: "white"}),
], null, {backgroundColor: "white", width: "150px", border: '1px solid black'});
}

//*********************************************************************************
// ## Global stuff
{
// while (Map.drawingTools().layers().length() > 0) {
// Map.drawingTools().layers().remove(Map.drawingTools().layers().get(0));
// } 
// Map.drawingTools().setShown(false);
Map.centerObject(ee.Geometry.Point([26, 26]), 2);
ui.root.add(descriptionPanel);
ui.root.add(BAPpanel);
}
// End global stuff

