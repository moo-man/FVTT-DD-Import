
Hooks.on("renderSidebarTab", async (app, html) => {
  if (app.options.id == "scenes")
  {
    let button = $("<button class='import-dd'><i class='fas fa-file-import'></i> DungeonDraft Import</button>")
    let path = game.settings.get("dd-import", "importPath")
    button.click(function() {
      new Dialog({
        title : "DungeonDraft Import",
        content : 
        `</div>
         <div class="form-group import"><div class="import-options">Scene Name</div><input type = 'text' name = "sceneName"/></div>
         <div class="form-group import"><div class="import-options">Path</div><input type = 'text' name = "path" value="${path}"/></div>
         <div class="form-group import"><div class="import-options" title = "Fidelity decides how many cave walls to skip - Right is high fidelity, no walls skipped">Fidelity</div><input type="range" min="1" max="6" value: "3" name="fidelity"></div>
         <div class="form-group import"><div class="import-options">Upload</div><input class="file-picker" type = 'file' accept = ".dd2vtt"/></div>
        `,
        buttons :{
          import : {
            label : "Import",
            callback : async (html) => {
              let file = JSON.parse(await html.find(".file-picker")[0].files[0].text())
              let fileName = html.find(".file-picker")[0].files[0].name.split(".")[0];
              let sceneName = html.find('[name="sceneName"]').val()
              let fidelity = html.find('[name="fidelity"]').val()
              let path = html.find('[name="path"]').val()
              await DDImporter.uploadFile(file, fileName, path)
              DDImporter.DDImport(file, sceneName, fileName, path, fidelity)
              game.settings.set("dd-import", "importPath", path);
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
  game.settings.register("dd-import", "importPath", {
    name : "DungeonDraft Default Path",
    scope: "world",
    config: "false",
    type: String,
    default: "worlds/" + game.world.name
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

  static async DDImport(file, sceneName, fileName, path, fidelity)
  {

    let newScene = await Scene.create({
     img : path + "/" + fileName + ".png",
     name : sceneName,
     grid: file.resolution.pixels_per_grid, 
     width : file.resolution.pixels_per_grid * file.resolution.map_size.x, 
     height : file.resolution.pixels_per_grid * file.resolution.map_size.y
    })
    let walls = this.GetWalls(file, newScene, 6-fidelity)
    let doors = this.GetDoors(file, newScene)
    let lights = this.GetLights(file, newScene);
    newScene.update({walls: walls.concat(doors), lights : lights})
  }

  static GetWalls(file, scene, skipNum)
  {
    let walls = [];
    let ddWalls = file.line_of_sight
    ddWalls = this.preprocessWalls(ddWalls, skipNum)
    let sceneDimensions = Canvas.getDimensions(scene.data)
    let offsetX = sceneDimensions.paddingX;
    let offsetY = sceneDimensions.paddingY;

    for (let wallSet of ddWalls)
    {
      for (let i = 0; i < wallSet.length-1; i++)
      {
        walls.push(new Wall({
          c : [
            (wallSet[i].x   * file.resolution.pixels_per_grid) + offsetX,
            (wallSet[i].y   * file.resolution.pixels_per_grid) + offsetY,
            (wallSet[i+1].x * file.resolution.pixels_per_grid) + offsetX,
            (wallSet[i+1].y * file.resolution.pixels_per_grid) + offsetY
          ]
        }).data)
      }
    }

    return walls

  }

  static preprocessWalls(walls, numToSkip)
  {
    for (let wallSet of walls)
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
    }
    return walls
  }

  static distance(p1, p2)
  {
    return Math.sqrt(Math.pow((p1.x - p2.x), 2) + Math.pow((p1.y - p2.y), 2))
  }

  static GetDoors(file, scene)
  {
    let doors = [];
    let ddDoors = file.portals;
    let sceneDimensions = Canvas.getDimensions(scene.data)
    let offsetX = sceneDimensions.paddingX;
    let offsetY = sceneDimensions.paddingY;

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
          tintAlpha: 0.05
        })
        lights.push(newLight.data);
    }
    return lights;
    } 
}