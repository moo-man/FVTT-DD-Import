Hooks.on("renderSidebarTab", async (app, html) => {
  if (app.options.id == "scenes") {
    let button = $("<button class='import-dd'><i class='fas fa-file-import'></i> DungeonDraft Import</button>")
 
    button.click(function () {
      new DDImporter().render(true);
    });
    
    html.find(".directory-footer").append(button);
  }
})

Hooks.on("init", () => {
  game.settings.register("dd-import", "importSettings", {
    name: "DungeonDraft Default Path",
    scope: "world",
    config: false,
    default: {
      source: "data",
      extension: "png",
      bucket: "",
      region: "",
      path: "worlds/" + game.world.name,
      offset: 0.1,
      fidelity: 3,
    }
  })

  game.settings.register("dd-import", "openableWindows", {
    name: "Openable Windows",
    hint: "Should windows be openable? Note that you can make portals import as windows by unchecking 'block light' in Dungeondraft",
    scope: "world",
    config: true,
    type: Boolean,
    default: false
  })
})



class DDImporter extends Application
{


  static get defaultOptions()
  {
      const options = super.defaultOptions;
      options.id = "dd-importer";
      options.template = "modules/dd-import/importer.html"
      options.classes.push("dd-importer");
      options.resizable = false;
      options.height = "auto";
      options.width = 400;
      options.minimizable = true;
      options.title = "Dungeondraft Importer"
      return options;
}


getData(){
  let data = super.getData();
  let settings = game.settings.get("dd-import", "importSettings")

  data.dataSources = {
    data: "User Data",
    s3 : "S3"
  }
  data.defaultSource = settings.source || "data";

  data.imgExtensions = {
    "png": "png",
    "webp" : "webp"
  }
  data.defaultExtension = settings.extension || "png";

  data.s3Bucket = settings.bucket || "",
  data.s3Region = settings.region || "",

  data.path = settings.path || "";
  data.offset = settings.offset || 0;
  return data
}



activateListeners(html)
{
  super.activateListeners(html)
  
  DDImporter.checkPath(html)
  DDImporter.checkFidelity(html)
  DDImporter.checkSource(html)

  html.find(".path-input").keyup(ev => DDImporter.checkPath(html))
  html.find(".fidelity-input").change(ev => DDImporter.checkFidelity(html))
  html.find(".source-selector").change(ev => DDImporter.checkSource(html))
    
  html.find(".import-map").click(async ev => {
    let file = JSON.parse(await html.find(".file-input")[0].files[0].text());
    let fileName = html.find(".file-input")[0].files[0].name.split(".")[0];
    let sceneName = html.find('[name="sceneName"]').val() || fileName
    let fidelity = parseInt(html.find('[name="fidelity"]').val())
    let offset = parseFloat(html.find('[name="offset"]').val().replace(',', '.'))
    let source = html.find('[name="source"]').val()
    let extension = html.find('[name="extension"]').val()
    let bucket = html.find('[name="bucket"]').val()
    let region = html.find('[name="region"]').val()
    let path = html.find('[name="path"]').val()
    await DDImporter.uploadFile(file, fileName, path, source, extension, bucket)
    DDImporter.DDImport(file, sceneName, fileName, path, fidelity, offset, extension, bucket, region, source)
    game.settings.set("dd-import", "importSettings", {
      source: source,
      extension: extension,
      bucket: bucket,
      region: region,
      path: path,
      offset: offset,
      fidelity: fidelity,
    });
    this.close();

  })
}

static checkPath(html)
{
  let pathValue = $("[name='path']")[0].value
  if (pathValue[1] == ":")
  {
    html.find(".warning.path")[0].style.display = ""
  }
  else
    html.find(".warning.path")[0].style.display = "none"
}

static checkFidelity(html)
{  
  let fidelityValue= $("[name='fidelity']")[0].value
  if (Number(fidelityValue) > 1)
  {
    html.find(".warning.fidelity")[0].style.display = ""
  }
  else
    html.find(".warning.fidelity")[0].style.display = "none"

}

static checkSource(html)
{
  let sourceValue= $("[name='source']")[0].value
  if (sourceValue == "s3")
  {
    html.find(".s3-section")[0].style.display=""
  }
  else
  {
    html.find(".s3-section")[0].style.display="none"
  }

}


  static async uploadFile(file, name, path, source, extension, bucket) {
    var byteString = atob(file.image);
    var ab = new ArrayBuffer(byteString.length);
    var ia = new Uint8Array(ab);

    for (var i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    let uploadFile = new File([ab], name + "." + extension, { type: 'image/' + extension });
    await FilePicker.upload(source, path, uploadFile, { bucket: bucket })
  }

  static async DDImport(file, sceneName, fileName, path, fidelity, offset, extension, bucket, region, source) {
    if (path && path[path.length-1] != "/")
      path = path + "/"
    if (path && path[0] != "/")
      path = "/" + path
    if (!path) 
      path = "/"
    let imagePath = path + fileName + "." + extension;
    if (source === "s3") {
      imagePath = "https://" + bucket + ".s3." + region + ".amazonaws.com" + imagePath;
    }
    let newScene = await Scene.create({
      name: sceneName,
      grid: file.resolution.pixels_per_grid,
      width: file.resolution.pixels_per_grid * file.resolution.map_size.x,
      height: file.resolution.pixels_per_grid * file.resolution.map_size.y
    })
    let walls = this.GetWalls(file, newScene, 6 - fidelity, offset)
    let doors = this.GetDoors(file, newScene, offset)
    let lights = this.GetLights(file, newScene);
    newScene.update({ img: imagePath, walls: walls.concat(doors), lights: lights })
  }

  static GetWalls(file, scene, skipNum, offset) {
    let walls = [];
    let ddWalls = file.line_of_sight

    for (let wsIndex = 0; wsIndex < ddWalls.length; wsIndex++) {
      let wallSet = ddWalls[wsIndex]
      // Find walls that directly end on this walls endpoints. So we can close walls, after applying offets
      let connectTo = []
      let connectedTo = []
      for (let i = 0; i < ddWalls.length; i++) {
        if (i == wsIndex) continue
        if (wallSet[wallSet.length - 1].x == ddWalls[i][0].x && wallSet[wallSet.length - 1].y == ddWalls[i][0].y) {
          connectTo.push(ddWalls[i][0])
        }
        if (wallSet[0].x == ddWalls[i][ddWalls[i].length - 1].x && wallSet[0].y == ddWalls[i][ddWalls[i].length - 1].y) {
          connectedTo.push(wallSet[0])
        }
      }
      if (offset != 0) {
        wallSet = this.makeOffsetWalls(wallSet, offset)
      }
      wallSet = this.preprocessWalls(wallSet, skipNum)
      // Connect to walls that end *before* the current wall
      for (let i = 0; i < connectedTo.length; i++) {
        walls.push(this.makeWall(file, scene, connectedTo[i], wallSet[0]))
      }
      for (let i = 0; i < wallSet.length - 1; i++) {
        walls.push(this.makeWall(file, scene, wallSet[i], wallSet[i + 1]))
      }
      // Connect to walls that end *after* the current wall
      for (let i = 0; i < connectTo.length; i++) {
        walls.push(this.makeWall(file, scene, wallSet[wallSet.length - 1], connectTo[i]))
      }
    }

    return walls
  }

  static makeWall(file, scene, pointA, pointB) {
    let sceneDimensions = Canvas.getDimensions(scene.data)
    let offsetX = sceneDimensions.paddingX;
    let offsetY = sceneDimensions.paddingY;
    return new Wall({
      c: [
        (pointA.x * file.resolution.pixels_per_grid) + offsetX,
        (pointA.y * file.resolution.pixels_per_grid) + offsetY,
        (pointB.x * file.resolution.pixels_per_grid) + offsetX,
        (pointB.y * file.resolution.pixels_per_grid) + offsetY
      ]
    }).data
  }

  static preprocessWalls(wallSet, numToSkip) {
    let toRemove = [];
    let skipCounter = 0;
    for (let i = 0; i < wallSet.length - 2; i++) {
      if (i != 0 && i != wallSet.length - 2 && this.distance(wallSet[i], wallSet[i + 1]) < 0.3) {
        if (skipCounter == numToSkip) {
          skipCounter = 0;
        }
        else {
          skipCounter++;
          toRemove.push(i);
        }
      }
      else
        skipCounter = 0;
    }
    if (toRemove.length) {
      for (let i = toRemove.length - 1; i > 0; i--) {
        wallSet.splice(toRemove[i], 1)
      }
    }
    return wallSet
  }

  static makeOffsetWalls(wallSet, offset, shortWallThreshold = 0.3, shortWallAmountThreshold = 70) {
    let wallinfo = [];
    let shortWalls = this.GetShortWallCount(wallSet, shortWallThreshold);
    // Assume short wallsets or containing long walls are not caves.
    let shortWallAmount = Math.round((shortWalls / wallSet.length) * 100);
    if (wallSet.length < 10 || shortWallAmount < shortWallAmountThreshold) {
      return wallSet
    }
    // connect the ends if they match
    if (wallSet[0].x == wallSet[wallSet.length - 1].x && wallSet[0].y == wallSet[wallSet.length - 1].y) {
      wallSet.push(wallSet[1]);
      wallSet.push(wallSet[2]);
    }
    for (let i = 0; i < wallSet.length - 1; i++) {
      let slope;
      let myoffset;
      let woffset;
      let m;
      if ((wallSet[i + 1].x - wallSet[i].x) == 0) {
        slope = undefined;
        myoffset = offset;
        if (wallSet[i + 1].y < wallSet[i].y) {
          myoffset = -myoffset;
        }
        woffset = { x: myoffset, y: 0 }
        m = 0;
      } else {
        slope = ((wallSet[i + 1].y - wallSet[i].y) / (wallSet[i + 1].x - wallSet[i].x))
        let dir = (wallSet[i + 1].x - wallSet[i].x) >= 0;
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
    for (let i = 0; i < wallSet.length - 2; i++) {
      newWallSet.push(this.interception(wallinfo[i], wallinfo[i + 1]));
    }
    return newWallSet
  }

  static GetShortWallCount(wallSet, shortWallThreshold) {
    let shortCount = 0;
    for (let i = 0; i < wallSet.length - 1; i++) {
      if (this.distance(wallSet[i], wallSet[i + 1]) < shortWallThreshold) {
        shortCount++;
      }
    }
    return shortCount
  }

  static GetOffset(slope, offset, dir) {
    let yoffset = Math.sqrt((offset * offset) / (1 + slope * slope));
    let xoffset = slope * yoffset;
    if ((slope <= 0 && dir) || (slope > 0 && dir)) {
      return { x: xoffset, y: -yoffset }
    }
    return { x: -xoffset, y: yoffset }
  }

  static interception(wallinfo1, wallinfo2) {
    /*
     * x = (m2-m1)/(k1-k2)
     * y = k1*x + m1
     */
    if (wallinfo1.slope == undefined) {
      let m2 = wallinfo2.y - wallinfo2.slope * wallinfo2.x
      return { x: wallinfo1.x, y: wallinfo2.slope * wallinfo1.x + m2 }
    }
    if (wallinfo2.slope == undefined) {
      let m1 = wallinfo1.y - wallinfo1.slope * wallinfo1.x
      return { x: wallinfo2.x, y: wallinfo1.slope * wallinfo2.x + m1 }
    }
    let m1 = wallinfo1.y - wallinfo1.slope * wallinfo1.x
    let m2 = wallinfo2.y - wallinfo2.slope * wallinfo2.x
    let x = (m2 - m1) / (wallinfo1.slope - wallinfo2.slope)
    return { x: x, y: wallinfo1.slope * x + m1 }
  }

  static distance(p1, p2) {
    return Math.sqrt(Math.pow((p1.x - p2.x), 2) + Math.pow((p1.y - p2.y), 2))
  }

  static GetDoors(file, scene, offset) {
    let doors = [];
    let ddDoors = file.portals;
    let sceneDimensions = Canvas.getDimensions(scene.data)
    let offsetX = sceneDimensions.paddingX;
    let offsetY = sceneDimensions.paddingY;

    if (offset != 0) {
      ddDoors = this.makeOffsetWalls(ddDoors, offset)
    }
    for (let door of ddDoors) {
      doors.push(new Wall({
          c : [
            (door.bounds[0].x   * file.resolution.pixels_per_grid) + offsetX,
            (door.bounds[0].y   * file.resolution.pixels_per_grid) + offsetY,
            (door.bounds[1].x * file.resolution.pixels_per_grid) + offsetX,
            (door.bounds[1].y * file.resolution.pixels_per_grid) + offsetY
          ],
          door: game.settings.get("dd-import", "openableWindows") ? true : door.closed, // If openable windows - all portals should be doors, otherwise, only portals that "block light" should be openable (doors)
          sense: (door.closed) ? CONST.WALL_SENSE_TYPES.NORMAL : CONST.WALL_SENSE_TYPES.NONE
        }).data)
    }

    return doors
  }

  static GetLights(file, scene) {
    let lights = [];
    let sceneDimensions = Canvas.getDimensions(scene.data)
    let offsetX = sceneDimensions.paddingX;
    let offsetY = sceneDimensions.paddingY;
    for (let light of file.lights) {
      let newLight = new AmbientLight({
        t: "l",
        x: (light.position.x * file.resolution.pixels_per_grid) + offsetX,
        y: (light.position.y * file.resolution.pixels_per_grid) + offsetY,
        rotation: 0,
        dim: light.range * 4,
        bright: light.range * 2,
        angle: 360,
        tintColor: "#" + light.color.substring(2),
        tintAlpha: (0.2 * light.intensity)
      })
      lights.push(newLight.data);
    }
    return lights;
  }
}