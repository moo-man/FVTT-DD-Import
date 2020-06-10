Hooks.on("renderSidebarTab", async (app, html) => {
  if (app.options.id == "scenes")
  {
    let button = $("<button class='import-dd'><i class='fas fa-file-import'></i> DungeonDraft Import</button>")
    let settings = game.settings.get("dd-import", "importSettings")
    let path = settings.path;
    let offset = settings.offset;
    let fidelity = settings.fidelity;
    button.click(function() {
      new Dialog({
        title : "DungeonDraft Import",
        content : 
        `<div>
         <div class="form-group import"><div class="import-options">Scene Name</div><input type = 'text' name = "sceneName"/></div>
         <div class="form-group import" title="Where to save the embedded PNG map. Ex: worlds/yourworld/maps"><div class="import-options">Path</div><input type = 'text' name = "path" value="${path}"/></div>
         <div class="form-group import" title="Fidelity decides how many cave walls to skip - Right is high fidelity, no walls skipped"><div class="import-options">Fidelity</div><input type="range" min="1" max="6" value= "${fidelity}" name="fidelity"></div>
         <div class="form-group import"><div class="import-options">Upload</div><input class="file-picker" type = 'file' accept = ".dd2vtt"/></div>
        <div>
        <hr />
        <span><b>Advanced:</b></span>
        <div class="form-group import" title = "This parameter nudges cave walls away from the edge to see more of the wall."><div class="import-options">Offset</div><input type="number" min="-3" step="0.1" max="3" value="${offset}" name="offset"></div>
        </div>
        `,
        buttons :{
          import : {
            label : "Import",
            callback : async (html) => {
              let file = JSON.parse(await html.find(".file-picker")[0].files[0].text())
              let fileName = html.find(".file-picker")[0].files[0].name.split(".")[0];
              let sceneName = html.find('[name="sceneName"]').val() || fileName
              let fidelity = parseInt(html.find('[name="fidelity"]').val())
              let offset = parseFloat(html.find('[name="offset"]').val().replace(',', '.')) || 0
              let path = html.find('[name="path"]').val() || ""
              await DDImporter.uploadFile(file, fileName, path)
              DDImporter.DDImport(file, sceneName, fileName, path, fidelity, offset)
              game.settings.set("dd-import", "importSettings",{
                path:path,
                offset: offset,
                fidelity: fidelity,
              });
            }
          },
          cancel: {
            label : "Cancel"
          }
        },
        default: "import"
      }).render(true);
    })
    html.find(".directory-footer").append(button);
  }
})

Hooks.on("init", () => {
  game.settings.register("dd-import", "importSettings", {
    name : "DungeonDraft Default Path",
    scope: "world",
    config: false,
    default: {
      path:"worlds/" + game.world.name,
      offset: 0.1,
      fidelity: 3,
    }
  })
})



class DDImporter {

  static async uploadFile(file, name, path)
  {
    var byteString = atob(file.image);
    var ab = new ArrayBuffer(byteString.length);
    var ia = new Uint8Array(ab);

    for (var i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }
    let uploadFile = new File([ab], name + ".png", { type: 'image/png'});
    await FilePicker.upload("data", path, uploadFile, {})
  }

  static async DDImport(file, sceneName, fileName, path, fidelity, offset)
  {

    let img = path ? path + "/" + fileName + ".png" : fileName + ".png";
    let newScene = await Scene.create({
     name : sceneName,
     grid: file.resolution.pixels_per_grid, 
     width : file.resolution.pixels_per_grid * file.resolution.map_size.x, 
     height : file.resolution.pixels_per_grid * file.resolution.map_size.y,
    })
    newScene.update({img : img})
    let walls = this.GetWalls(file, newScene, 6-fidelity, offset)
    let doors = this.GetDoors(file, newScene, offset)
    let lights = this.GetLights(file, newScene);
    newScene.update({walls: walls.concat(doors), lights : lights})
  }

  static GetWalls(file, scene, skipNum, offset)
  {
    let walls = [];
    let ddWalls = file.line_of_sight

    for (let wsIndex = 0; wsIndex < ddWalls.length; wsIndex++)
    {
      let wallSet = ddWalls[wsIndex]
      // Find walls that directly end on this walls endpoints. So we can close walls, after applying offets
      let connectTo = []
      let connectedTo = []
      for (let i = 0; i < ddWalls.length; i++){
        if (i == wsIndex) continue
        if (wallSet[wallSet.length - 1].x == ddWalls[i][0].x && wallSet[wallSet.length - 1].y == ddWalls[i][0].y){
          connectTo.push(ddWalls[i][0])
        }
        if (wallSet[0].x == ddWalls[i][ddWalls[i].length - 1].x && wallSet[0].y == ddWalls[i][ddWalls[i].length - 1].y){
          connectedTo.push(wallSet[0])
        }
      }
      if (offset != 0){
        wallSet = this.makeOffsetWalls(wallSet, offset)
      }
      wallSet = this.preprocessWalls(wallSet, skipNum)
      // Connect to walls that end *before* the current wall
      for (let i = 0; i < connectedTo.length; i++)
      {
        walls.push(this.makeWall(file, scene, connectedTo[i], wallSet[0]))
      }
      for (let i = 0; i < wallSet.length-1; i++)
      {
        walls.push(this.makeWall(file, scene, wallSet[i], wallSet[i+1]))
      }
      // Connect to walls that end *after* the current wall
      for (let i = 0; i < connectTo.length; i++)
      {
        walls.push(this.makeWall(file, scene, wallSet[wallSet.length - 1], connectTo[i]))
      }
    }

    return walls
  }

  static makeWall(file, scene, pointA, pointB){
    let sceneDimensions = Canvas.getDimensions(scene.data)
    let offsetX = sceneDimensions.paddingX;
    let offsetY = sceneDimensions.paddingY;
    return new Wall({
      c : [
        (pointA.x * file.resolution.pixels_per_grid) + offsetX,
        (pointA.y * file.resolution.pixels_per_grid) + offsetY,
        (pointB.x * file.resolution.pixels_per_grid) + offsetX,
        (pointB.y * file.resolution.pixels_per_grid) + offsetY
      ]
    }).data
  }

  static preprocessWalls(wallSet, numToSkip)
  {
    let toRemove = [];
    let skipCounter = 0;
    for (let i = 0; i < wallSet.length-2; i++)
    {
      if (i != 0 && i != wallSet.length-2 && this.distance(wallSet[i], wallSet[i+1]) < 0.3)
      {
        if (skipCounter == numToSkip)
        {
          skipCounter = 0;
        }
        else 
        {
          skipCounter++;
          toRemove.push(i);
        }
      }
      else 
        skipCounter = 0;
    }
    if (toRemove.length)
    {
      for (let i = toRemove.length-1; i > 0; i--)
      {
        wallSet.splice(toRemove[i], 1)
      }
    }
    return wallSet
  }

  static makeOffsetWalls(wallSet, offset, shortWallThreshold=0.3, shortWallAmountThreshold=70){
    let wallinfo = [];
    let shortWalls = this.GetShortWallCount(wallSet, shortWallThreshold);
    // Assume short wallsets or containing long walls are not caves.
    let shortWallAmount = Math.round((shortWalls/wallSet.length)*100);
    if (wallSet.length < 10 || shortWallAmount < shortWallAmountThreshold){
      console.debug(`seems not to be a cave: ${wallSet.length} walls and ${shortWallAmount}% short Walls`);
      return wallSet
    }
      console.debug(`seems to be a CAVE: ${wallSet.length} walls and ${shortWallAmount}% short Walls`);
    // connect the ends if they match
    if (wallSet[0].x == wallSet[wallSet.length-1].x && wallSet[0].y == wallSet[wallSet.length-1].y){
      wallSet.push(wallSet[1]);
      wallSet.push(wallSet[2]);
    }
    for (let i = 0; i < wallSet.length-1; i++)
    {
      let slope;
      let myoffset;
      let woffset;
      let m;
      if ((wallSet[i+1].x - wallSet[i].x) == 0){
        slope = undefined;
        myoffset = offset;
        if (wallSet[i+1].y < wallSet[i].y){
          myoffset = -myoffset;
        }
        woffset = {x: myoffset, y: 0}
        m = 0;
      }else{
        slope = ((wallSet[i+1].y - wallSet[i].y)/(wallSet[i+1].x - wallSet[i].x))
        let dir = (wallSet[i+1].x - wallSet[i].x)>=0;
        woffset = this.GetOffset(slope, offset, dir);
        m = wallSet[i].x + woffset.x - wallSet[i].y + woffset.y
      }
      let x = wallSet[i].x + woffset.x
      let y = wallSet[i].y + woffset.y
      wallinfo.push({
        x: x,
        y: y,
        slope: slope,
        m: m
      })
    }
    let newWallSet = []
    for (let i = 0; i < wallSet.length-2; i++)
    {
      newWallSet.push(this.interception(wallinfo[i], wallinfo[i+1]));
    }
    return newWallSet
  }

  static GetShortWallCount(wallSet, shortWallThreshold){
    let shortCount = 0;
    for (let i = 0; i < wallSet.length-1; i++){
      if (this.distance(wallSet[i], wallSet[i+1]) < shortWallThreshold){
        shortCount++;
      }
    }
    return shortCount
  }

  static GetOffset(slope, offset, dir){
    let yoffset = Math.sqrt((offset*offset)/(1+slope*slope));
    let xoffset = slope * yoffset;
    if ((slope <= 0 && dir) || (slope > 0 && dir)){
      return {x : xoffset, y : -yoffset}
    }
    return {x : -xoffset, y : yoffset}
  }

  static interception(wallinfo1, wallinfo2){
    /*
     * x = (m2-m1)/(k1-k2)
     * y = k1*x + m1
     */
    if (wallinfo1.slope == undefined){
      let m2 = wallinfo2.y - wallinfo2.slope*wallinfo2.x
      return {x: wallinfo1.x, y: wallinfo2.slope * wallinfo1.x + m2}
    }
    if (wallinfo2.slope == undefined){
      let m1 = wallinfo1.y - wallinfo1.slope*wallinfo1.x
      return {x: wallinfo2.x, y: wallinfo1.slope * wallinfo2.x + m1}
    }
    let m1 = wallinfo1.y - wallinfo1.slope*wallinfo1.x
    let m2 = wallinfo2.y - wallinfo2.slope*wallinfo2.x
    let x = (m2 - m1)/(wallinfo1.slope - wallinfo2.slope)
    return {x: x, y: wallinfo1.slope * x + m1}
  }

  static distance(p1, p2)
  {
    return Math.sqrt(Math.pow((p1.x - p2.x), 2) + Math.pow((p1.y - p2.y), 2))
  }

  static GetDoors(file, scene, offset)
  {
    let doors = [];
    let ddDoors = file.portals;
    let sceneDimensions = Canvas.getDimensions(scene.data)
    let offsetX = sceneDimensions.paddingX;
    let offsetY = sceneDimensions.paddingY;

    if (offset != 0){
      ddDoors = this.makeOffsetWalls(ddDoors, offset)
    }
    for (let door of ddDoors)
    {
      doors.push(new Wall({
          c : [
            (door.bounds[0].x   * file.resolution.pixels_per_grid) + offsetX,
            (door.bounds[0].y   * file.resolution.pixels_per_grid) + offsetY,
            (door.bounds[1].x * file.resolution.pixels_per_grid) + offsetX,
            (door.bounds[1].y * file.resolution.pixels_per_grid) + offsetY
          ],
          door: true
        }).data)
    }

    return doors
  }

  static GetLights(file, scene)
  {
    let lights = [];
    let sceneDimensions = Canvas.getDimensions(scene.data)
    let offsetX = sceneDimensions.paddingX;
    let offsetY = sceneDimensions.paddingY;
    for (let light of file.lights)
    {
        let newLight = new AmbientLight({
          t: "l",
          x: (light.position.x * file.resolution.pixels_per_grid)+offsetX,
          y: (light.position.y * file.resolution.pixels_per_grid)+offsetY,
          rotation: 0,
          dim: light.range*4,
          bright: light.range*2,
          angle: 360,
          tintColor: "#" + light.color.substring(2),
          tintAlpha: (0.2 * light.intensity)
        })
        lights.push(newLight.data);
    }
    return lights;
    } 
}
