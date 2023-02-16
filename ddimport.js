Hooks.on("renderSidebarTab", async (app, html) => {
  if (app.options.id == "scenes") {
    let button = $("<button class='import-dd'><i class='fas fa-file-import'></i> Universal Battlemap Import</button>")

    button.click(function () {
      new DDImporter().render(true);
    });

    html.find(".directory-footer").append(button);
  }
})

Hooks.on("init", () => {
  game.settings.register("dd-import", "importSettings", {
    name: "Dungeondraft Default Path",
    scope: "world",
    config: false,
    default: {
      source: "data",
      bucket: "",
      path: "worlds/" + game.world.id,
      offset: 0.0,
      fidelity: 3,
      multiImageMode: "g",
      webpConversion: true,
      wallsAroundFiles: true,
      useCustomPixelsPerGrid: false,
      defaultCustomPixelsPerGrid: 100,
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




class DDImporter extends FormApplication {


  static get defaultOptions() {
    const options = super.defaultOptions;
    options.id = "dd-importer";
    options.template = "modules/dd-import/importer.html"
    options.classes.push("dd-importer");
    options.resizable = false;
    options.height = "auto";
    options.width = 400;
    options.minimizable = true;
    options.title = "Universal Battlemap Importer"
    return options;
  }


  async getData() {
    let data = await super.getData();
    let settings = game.settings.get("dd-import", "importSettings")

    data.dataSources = {
      data: "User Data",
      s3: "S3"
    }
    data.defaultSource = settings.source || "data";

    data.s3Bucket = settings.bucket || "";
    try {
      data.bucketOptions = (await FilePicker.browse("s3", "")).dirs;
    }
    catch (e)
    {
      console.log("No S3 buckets found")
    }
    data.path = settings.path || "";
    data.offset = settings.offset || 0;
    data.padding = settings.padding || 0.25

    data.multiImageModes = {
      "g": "Grid",
      "y": "Vertical",
      "x": "Horizontal",
    }
    data.multiImageMode = settings.multiImageMode || "g";
    data.webpConversion = settings.webpConversion;
    data.wallsAroundFiles = settings.wallsAroundFiles;

    data.useCustomPixelsPerGrid = settings.useCustomPixelsPerGrid;
    data.defaultCustomPixelsPerGrid = settings.defaultCustomPixelsPerGrid || 100;
    return data
  }


  async _updateObject(event, formData) {
    try {
      let sceneName = formData["sceneName"]
      let fidelity = parseInt(formData["fidelity"])
      let offset = parseFloat(formData["offset"])
      let padding = parseFloat(formData["padding"])
      let source = formData["source"]
      let bucket = formData["bucket"]
      let path = formData["path"]
      let filecount = formData["filecount"]
      let mode = formData["multi-mode"]
      let toWebp = formData["convert-to-webp"]
      let objectWalls = formData["object-walls"]
      let wallsAroundFiles = formData["walls-around-files"]
      let imageFileName = formData["imageFileName"]
      let useCustomPixelsPerGrid = formData["use-custom-gridPPI"]
      let customPixelsPerGrid = formData["customGridPPI"] * 1
      var firstFileName

      if ((!bucket) && source == "s3")
        return ui.notifications.error("Bucket required for S3 upload")

      let files = []
      var fileName = 'combined'
      for (var i = 0; i < filecount; i++) {
        let fe = this.element.find("[name=file" + i + "]")
        if (fe[0].files[0] === undefined) {
          console.log("SKIPPING")
          continue
        }
        try {
          files.push(JSON.parse(await fe[0].files[0].text()));
          fileName = fileName + '-' + fe[0].files[0].name.split(".")[0];
          // save the first filename
          if (files.length == 1) {
            firstFileName = fe[0].files[0].name.split(".")[0]
          }
        } catch (e) {
          if (filecount > 1) {
            ui.notifications.warning("Skipping due to error while importing: " + fe[0].files[0].name + " " + e)
          } else {
            throw (e)
          }
        }
      }
      // keep the original filename if it is only one file at all
      if (files.length == 0) {
        ui.notifications.error("Skipped all files while importing.")
        throw new Error("Skipped all files");
      }
      if (files.length == 1) {
        fileName = firstFileName;
      } else {
        ui.notifications.notify("Combining images may take quite some time, be patient")
      }
      if (imageFileName) {
        fileName = imageFileName
        firstFileName = imageFileName
      }
      // lets use the first filename for the scene
      if (sceneName == '') {
        sceneName = firstFileName
      }

      // determine the pixels per grid value to use
      let pixelsPerGrid = ""
      if (useCustomPixelsPerGrid) {
        pixelsPerGrid = customPixelsPerGrid
      } else {
        pixelsPerGrid = files[0].resolution.pixels_per_grid
      }
      console.log("Grid PPI = ", pixelsPerGrid)

      // do the placement math
      let size = {}
      size.x = files[0].resolution.map_size.x
      size.y = files[0].resolution.map_size.y
      let grid_size = { 'x': size.x, 'y': size.y }
      size.x = size.x * pixelsPerGrid
      size.y = size.y * pixelsPerGrid

      let count = files.length
      var width, height, gridw, gridh
      // respect the stitching mode
      if (mode == 'y') {
        // vertical stitching
        gridw = grid_size.x
        gridh = count * grid_size.y
        for (var f = 0; f < files.length; f++) {
          files[f].pos_in_image = { "x": 0, "y": f * size.y }
          files[f].pos_in_grid = { "x": 0, "y": f * grid_size.y }
        }
      } else if (mode == 'x') {
        // horizontal stitching
        for (var f = 0; f < files.length; f++) {
          files[f].pos_in_image = { "y": 0, "x": f * size.x }
          files[f].pos_in_grid = { "y": 0, "x": f * grid_size.x }
        }
        gridw = count * grid_size.x
        gridh = grid_size.y
      } else if (mode == 'g') {
        // grid is the most complicated one
        // we count the rows, as we fill them up first, e.g. 5 images will end up in 2 rows, the first with 3 the second with two images.
        var vcount = 0
        var hcount = count
        var index = 0
        let hwidth = Math.ceil(Math.sqrt(count))
        // continue as there are images left
        while (hcount > 0) {
          var next_v_index = index + hwidth
          // fill up each row, until all images are placed
          while (index < Math.min(next_v_index, files.length)) {
            files[index].pos_in_image = { "y": vcount * size.y, "x": (index - vcount * hwidth) * size.x }
            files[index].pos_in_grid = { "y": vcount * grid_size.y, "x": (index - vcount * hwidth) * grid_size.x }
            index += 1
          }
          hcount -= hwidth
          vcount += 1
        }
        gridw = hwidth * grid_size.x
        gridh = vcount * grid_size.y
      }
      width = gridw * pixelsPerGrid
      height = gridh * pixelsPerGrid
      //placement math done.
      //Now use the image direct, in case of only one image and no conversion required
      var image_type = '?'

      // This code works for both single files and multiple files and supports resizing during scene generation
      // Use a canvas to place the image in case we need to convert something
      let thecanvas = document.createElement('canvas');
      thecanvas.width = width;
      thecanvas.height = height;
      let mycanvas = thecanvas.getContext("2d");
      ui.notifications.notify("Processing Images")
      for (var fidx = 0; fidx < files.length; fidx++) {
        ui.notifications.notify("Processing " + (fidx + 1) + " out of " + files.length + " images")
        let f = files[fidx];
        image_type = DDImporter.getImageType(atob(f.image.substr(0, 8)));
        await DDImporter.image2Canvas(mycanvas, f, image_type, size.x, size.y)
      }
      ui.notifications.notify("Uploading image ....")
      if (toWebp) {
        image_type = 'webp';
      }

      var p = new Promise(function (resolve) {
        thecanvas.toBlob(function (blob) {
          blob.arrayBuffer().then(bfr => {
            DDImporter.uploadFile(bfr, fileName, path, source, image_type, bucket)
              .then(function () {
                resolve()
              })
          });
        }, "image/" + image_type)
      })



      // aggregate the walls and place them right
      let aggregated = {
        "format": 0.2,
        "resolution": {
          "map_origin": { "x": files[0].resolution.map_origin.x, "y": files[0].resolution.map_origin.y },
          "map_size": { "x": gridw, "y": gridh },
          "pixels_per_grid": pixelsPerGrid,
        },
        "line_of_sight": [],
        "portals": [],
        "environment": files[0]["environment"],
        "lights": [],
      }

      // adapt the walls
      for (var fidx = 0; fidx < files.length; fidx++) {
        let f = files[fidx];
        if (objectWalls)
          f.line_of_sight = f.line_of_sight.concat(f.objects_line_of_sight || [])
        f.line_of_sight.forEach(function (los) {
          los.forEach(function (z) {
            z.x += f.pos_in_grid.x
            z.y += f.pos_in_grid.y
          })
        })
        f.portals.forEach(function (port) {
          port.position.x += f.pos_in_grid.x
          port.position.y += f.pos_in_grid.y
          port.bounds.forEach(function (z) {
            z.x += f.pos_in_grid.x
            z.y += f.pos_in_grid.y
          })
        })
        f.lights.forEach(function (port) {
          port.position.x += f.pos_in_grid.x
          port.position.y += f.pos_in_grid.y
        })

        aggregated.line_of_sight = aggregated.line_of_sight.concat(f.line_of_sight)
        //Add wall around the image
        if (wallsAroundFiles && files.length > 1) {
          aggregated.line_of_sight.push(
            [
              { 'x': f.pos_in_grid.x, 'y': f.pos_in_grid.y },
              { 'x': f.pos_in_grid.x + f.resolution.map_size.x, 'y': f.pos_in_grid.y },
              { 'x': f.pos_in_grid.x + f.resolution.map_size.x, 'y': f.pos_in_grid.y + f.resolution.map_size.y },
              { 'x': f.pos_in_grid.x, 'y': f.pos_in_grid.y + f.resolution.map_size.y },
              { 'x': f.pos_in_grid.x, 'y': f.pos_in_grid.y }
            ])
        }
        aggregated.lights = aggregated.lights.concat(f.lights)
        aggregated.portals = aggregated.portals.concat(f.portals)
      }
      ui.notifications.notify("Upload still in progress, please wait")
      await p
      ui.notifications.notify("Creating scene")
      DDImporter.DDImport(aggregated, sceneName, fileName, path, fidelity, offset, padding, image_type, bucket, game.data.files.s3?.endpoint, source, pixelsPerGrid)

      game.settings.set("dd-import", "importSettings", {
        source: source,
        bucket: bucket,
        path: path,
        offset: offset,
        padding: padding,
        fidelity: fidelity,
        multiImageMode: mode,
        webpConversion: toWebp,
        wallsAroundFiles: wallsAroundFiles,
      });
    }
    catch (e) {
      ui.notifications.error("Error Importing: " + e)
    }
  }


  activateListeners(html) {
    super.activateListeners(html)

    DDImporter.checkPath(html)
    DDImporter.checkFidelity(html)
    DDImporter.checkSource(html)
    this.setRangeValue(html)


    html.find(".path-input").keyup(ev => DDImporter.checkPath(html))
    html.find(".fidelity-input").change(ev => DDImporter.checkFidelity(html))
    html.find(".source-selector").change(ev => DDImporter.checkSource(html))
    html.find(".padding-input").change(ev => this.setRangeValue(html))

    html.find(".add-file").click(async ev => {
      var newfile = document.createElement("input");
      let counter = html.find('[name="filecount"]')[0]
      newfile.setAttribute("class", "file-input")
      newfile.setAttribute("type", "file")
      newfile.setAttribute("accept", ".dd2vtt,.df2vtt,.uvtt")
      newfile.setAttribute("name", "file" + counter.value)
      counter.value = parseInt(counter.value) + 1
      let files = html.find("#dd-upload-files")[0]
      files.insertBefore(newfile, counter)
      html.find(".multi-mode-section")[0].style.display = ""
    })

    html.find(".use-custom-gridPPI").click(async ev => {
      if (html.find('[name="use-custom-gridPPI"]')[0].checked) {
        html.find(".custom-gridPPI-section")[0].style.display = ""
      } else {
        html.find(".custom-gridPPI-section")[0].style.display = "none"
      }
    })

    html.find(".import-map").click(async ev => {


    })
  }

  setRangeValue(html) {
    let val = html.find(".padding-input").val()
    html.find(".range-value")[0].textContent = val
  }

  static checkPath(html) {
    let pathValue = $("[name='path']")[0].value
    if (pathValue[1] == ":") {
      html.find(".warning.path")[0].style.display = ""
    }
    else
      html.find(".warning.path")[0].style.display = "none"
  }

  static checkFidelity(html) {
    let fidelityValue = $("[name='fidelity']")[0].value
    if (Number(fidelityValue) > 1) {
      html.find(".warning.fidelity")[0].style.display = ""
    }
    else
      html.find(".warning.fidelity")[0].style.display = "none"

  }

  static checkSource(html) {
    let sourceValue = $("[name='source']")[0].value
    if (sourceValue == "s3") {
      html.find(".s3-section")[0].style.display = ""
    }
    else {
      html.find(".s3-section")[0].style.display = "none"
    }

  }


  static DecodeImage(file) {
    var byteString = atob(file.image);
    var ab = new ArrayBuffer(byteString.length);
    var ia = new Uint8Array(ab);

    for (var i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    return ab;
  }

  static Uint8ToBase64(u8Arr) {
    var CHUNK_SIZE = 0x8000;
    var index = 0;
    var length = u8Arr.length;
    var result = '';
    var slice;
    // we need to do slices for large amount of data
    while (index < length) {
      slice = u8Arr.subarray(index, Math.min(index + CHUNK_SIZE, length));
      result += String.fromCharCode.apply(null, slice);
      index += CHUNK_SIZE;
    }
    return btoa(result);
  }

  
  static Uint8ToBlob(u8Arr, type) {
    return new Blob([u8Arr], {type : "image/" + type});
  }

  static getImageType(bytes) {
    let magic = bytes.substr(0, 4);
    console.log(magic);
    console.log(magic.charCodeAt(0));
    if (magic == "\u0089PNG") {
      return 'png'
    } else if (magic == "RIFF") {
      return 'webp';
    } else if (magic == "\u00ff\u00d8\u00ff\u00e0") {
      return 'jpeg';
    }
    return 'png';
  }

  static image2Canvas(canvas, file, extension, imageWidth, imageHeight) {
    return new Promise(function (resolve) {
      var image = new Image();
      image.decoding = 'sync';
      image.addEventListener('load', function () {
        image.decode().then(() => {
          canvas.drawImage(image, file.pos_in_image.x, file.pos_in_image.y, imageWidth, imageHeight);
          resolve()
        }).catch(e => {
          console.log("decode failed because of DOMException, lets try directly");
          console.log(e);
          canvas.drawImage(image, file.pos_in_image.x, file.pos_in_image.y, imageWidth, imageHeight);
          resolve()
        });
      });
      image.src = URL.createObjectURL(DDImporter.Uint8ToBlob(DDImporter.DecodeImage(file), extension))
    });
  }

  static async uploadFile(file, name, path, source, extension, bucket) {
    let uploadFile = new File([file], name + "." + extension, { type: 'image/' + extension });
    await FilePicker.upload(source, path, uploadFile, { bucket: bucket })
  }

  static async DDImport(file, sceneName, fileName, path, fidelity, offset, padding, extension, bucket, endpoint, source, pixelsPerGrid) {
    if (path && path[path.length - 1] != "/")
      path = path + "/"
    let imagePath = path + fileName + "." + extension;
    if (source === "s3") {
      if (imagePath[0] == "/")
        imagePath = imagePath.slice(1)
      imagePath = endpoint.protocol + '//' + bucket + '.' + endpoint.host + endpoint.path + imagePath;
    }
    let newScene = new Scene({
      name: sceneName,
      grid: pixelsPerGrid,
      img: imagePath,
      width: pixelsPerGrid * file.resolution.map_size.x,
      height: pixelsPerGrid * file.resolution.map_size.y,
      padding: padding,
      shiftX: 0,
      shiftY: 0
    })
    newScene.updateSource(
      {
        walls: this.GetWalls(file, newScene, 6 - fidelity, offset, pixelsPerGrid).concat(this.GetDoors(file, newScene, offset, pixelsPerGrid)).map(i => i.toObject()),
        lights: this.GetLights(file, newScene, pixelsPerGrid).map(i => i.toObject())
      })
    //mergeObject(newScene.data, {walls: walls.concat(doors), lights: lights})
    let scene = await Scene.create(newScene.toObject());
    scene.createThumbnail().then(thumb => {
      scene.update({ "thumb": thumb.thumb });
    })
  }

  static GetWalls(file, scene, skipNum, offset, pixelsPerGrid) {
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
        if (DDImporter.isWithinMap(file, connectedTo[i]) || DDImporter.isWithinMap(file, wallSet[0]))
          walls.push(this.makeWall(file, scene, connectedTo[i], wallSet[0], pixelsPerGrid))
      }
      for (let i = 0; i < wallSet.length - 1; i++) {
        if (DDImporter.isWithinMap(file, wallSet[i]) || DDImporter.isWithinMap(file, wallSet[i + 1]))
          walls.push(this.makeWall(file, scene, wallSet[i], wallSet[i + 1], pixelsPerGrid))
      }
      // Connect to walls that end *after* the current wall
      for (let i = 0; i < connectTo.length; i++) {
        if (DDImporter.isWithinMap(file, wallSet[wallSet.length - 1]) || DDImporter.isWithinMap(file, connectTo[i]))
          walls.push(this.makeWall(file, scene, wallSet[wallSet.length - 1], connectTo[i], pixelsPerGrid))
      }
    }

    return walls.filter(w => w)
  }

  static makeWall(file, scene, pointA, pointB, pixelsPerGrid) {
    let sceneDimensions = scene.getDimensions()
    let offsetX = sceneDimensions.sceneX
    let offsetY = sceneDimensions.sceneY
    let originX = file.resolution.map_origin.x
    let originY = file.resolution.map_origin.y

    try {
      return new WallDocument({
        c: [
          ((pointA.x - originX) * pixelsPerGrid) + offsetX,
          ((pointA.y - originY) * pixelsPerGrid) + offsetY,
          ((pointB.x - originX) * pixelsPerGrid) + offsetX,
          ((pointB.y - originY) * pixelsPerGrid) + offsetY
        ]
      })
    }
    catch (e) {
      console.error("Could not create Wall Document: " + e)
    }
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
    if (wallinfo1.slope == undefined && wallinfo2.slope == undefined) {
      return { x: wallinfo1.x, y: (wallinfo1.y + wallinfo2.y) / 2 }
    }
    else if (wallinfo1.slope == undefined) {
      let m2 = wallinfo2.y - wallinfo2.slope * wallinfo2.x
      return { x: wallinfo1.x, y: wallinfo2.slope * wallinfo1.x + m2 }
    }
    else if (wallinfo2.slope == undefined) {
      let m1 = wallinfo1.y - wallinfo1.slope * wallinfo1.x
      return { x: wallinfo2.x, y: wallinfo1.slope * wallinfo2.x + m1 }
    }
    /* special case if we skipped a short wall, which leads to two parallel walls,
     * or we have a straight wall with multiple points. */
    else if (wallinfo1.slope == wallinfo2.slope) {
      if (wallinfo1.slope == 0) {
        return { x: wallinfo1.x + (wallinfo2.x - wallinfo1.x) / 2, y: wallinfo1.y }
      } else {
        return { x: wallinfo1.x, y: wallinfo1.y + (wallinfo2.y - wallinfo1.y) / 2 }
      }

    }
    let m1 = wallinfo1.y - wallinfo1.slope * wallinfo1.x
    let m2 = wallinfo2.y - wallinfo2.slope * wallinfo2.x
    let x = (m2 - m1) / (wallinfo1.slope - wallinfo2.slope)
    return { x: x, y: wallinfo1.slope * x + m1 }
  }

  static distance(p1, p2) {
    return Math.sqrt(Math.pow((p1.x - p2.x), 2) + Math.pow((p1.y - p2.y), 2))
  }

  static GetDoors(file, scene, offset, pixelsPerGrid) {
    let doors = [];
    let ddDoors = file.portals;
    let sceneDimensions = scene.getDimensions()
    let offsetX = sceneDimensions.sceneX
    let offsetY = sceneDimensions.sceneY

    if (offset != 0) {
      ddDoors = this.makeOffsetWalls(ddDoors, offset)
    }
    for (let door of ddDoors) {
      try {

        doors.push(new WallDocument({
          c: [
            (door.bounds[0].x * pixelsPerGrid) + offsetX,
            (door.bounds[0].y * pixelsPerGrid) + offsetY,
            (door.bounds[1].x * pixelsPerGrid) + offsetX,
            (door.bounds[1].y * pixelsPerGrid) + offsetY
          ],
          door: game.settings.get("dd-import", "openableWindows") ? 1 : (door.closed ? 1 : 0), // If openable windows - all portals should be doors, otherwise, only portals that "block light" should be openable (doors)
          sense: (door.closed) ? CONST.WALL_SENSE_TYPES.NORMAL : CONST.WALL_SENSE_TYPES.NONE
        }))
      }
      catch(e)
      {
        console.error("Could not create Wall Document (door): " + e)
      }
    }

    return doors.filter(d => d)
  }

  static GetLights(file, scene, pixelsPerGrid) {
    let lights = [];
    let sceneDimensions = scene.getDimensions()
    let offsetX = sceneDimensions.sceneX
    let offsetY = sceneDimensions.sceneY
    for (let light of file.lights) {
      if (DDImporter.isWithinMap(file, light.position)) {
        try {
          let newLight = new AmbientLightDocument({
            t: "l",
            x: ((light.position.x - file.resolution.map_origin.x) * pixelsPerGrid) + offsetX,
            y: ((light.position.y - file.resolution.map_origin.y) * pixelsPerGrid) + offsetY,
            rotation: 0,
            dim: light.range * (game.system.gridDistance || 1),
            bright: (light.range * (game.system.gridDistance || 1)) / 2,
          angle: 360,
          tintColor: "#" + light.color.substring(2),
          tintAlpha: (0.05 * light.intensity)
        })
        lights.push(newLight);
        }
        catch(e)
        {
          console.error("Could not create AmbientLight Document: " + e)
        }
      }
    }
    return lights.filter(l => l);
  }

  /**
   * Checks if point is within map crop
   * 
   * @param {Object} file uvtt file
   * @param {Object} position {x, y}
   * @returns 
   */
  static isWithinMap(file, position) {

    let map_originX = file.resolution.map_origin.x
    let map_originY = file.resolution.map_origin.y

    let map_sizeX = file.resolution.map_size.x
    let map_sizeY = file.resolution.map_size.y


    let within;

    if (
      position.x >= map_originX &&
      position.x <= map_originX + map_sizeX &&
      position.y >= map_originY &&
      position.y <= map_originY + map_sizeY)
      within = true
    else within = false

    return within

  }
}
