Hooks.on("getSceneDirectoryEntryContext", (html, list) => {
  console.log(html, list);
  list.push({
    name: "DungeonDraft Import",
    icon: "<i class='fas fa-file-import'></i>",
    callback: scene => {
      DDImporter.Prompt(game.scenes.get(scene.attr("data-entity-id")))
    }
  })
})

class DDImporter {


  static Prompt(scene) 
  {
    if (canvas.scene._id != scene.data._id)
    {
      ui.notifications.error("Move to this scene to import");
      return
    }
    let html = 
      `<textarea class = "dd-import-text" name= "importData"></textarea>`
    new Dialog({
      title: "Dungeon Draft Import",
      content : html,
      buttons : {
        confirm : {
          label: "Confirm",
          callback : (html) => this.DDImport(scene, JSON.parse(html.find('[name="importData').val()))
        },
        cancel : {
          label: "Cancel"
        }
      },
      default: "confirm"
    }).render(true);
  }

  static async DDImport(scene, file)
  {
    let level = 0;
    if (file.world.levels[1])
    {
      let levelOptions = "";
      for (let level in file.world.levels)
        levelOptions = levelOptions.concat(`<option value="${level}">${file.world.levels[level].label}</option>`)

      let html = 
        `<p>Which level do you want to import?</p>
        <select name = "level-selector">
        ${levelOptions}
        </select>
        `

      await new Dialog({
        title: "Dungeon Draft Level Selector",
        content : html,
        buttons : {
          confirm : {
            label: "Select",
            callback : (html) => {
              level = JSON.parse(html.find('[name="level-selector').val())
              scene.update({"walls" : this.GetWalls(file, level)});
              scene.update({"lights" : this.GetLights(file, level)});
              return;
            }
          },
          cancel : {
            label: "Cancel",
            callback : html => {return}
          }
        },
        default: "confirm"
      }).render(true);    
    }
    else
    {
      scene.update({"walls" : this.GetWalls(file, level)});
      scene.update({"lights" : this.GetLights(file, level)});
    }

  }

  static convertPointFromDDtoFVTT(point){
    let offsetX = canvas.dimensions.paddingX;
    let offsetY = canvas.dimensions.paddingY;
    let ddScale = canvas.grid.size/256;
    return [(point[0]*ddScale)+offsetX, (point[1]*ddScale)+offsetY]
  }

  static GetWalls(file, level)
  {
    let walls = [];
    let ddPortalList = [];
    let allwalls = [];
    let alldoors = [];
    for (let index in file.world.levels[level].walls)
    {
      if (isNaN(index)) continue
      let wallSet = []
      let ddWalls = file.world.levels[level].walls[index]
      let ddPointString = ddWalls.points;
      let points = ddPointString.substring(18, ddPointString.length-2).split(", ").map(a => Number(a))
      if (ddWalls.loop){
        points = points.concat(points.slice(0,2))
      }
      for(let i = 0; i < points.length-3; i+=2)
      {
        allwalls.push([[points[i], points[i+1]], [points[i+2], points[i+3]]])
      }
      for (let portal of ddWalls.portals){
        let portalCenterPoint = portal.position.substring(8, portal.position.length-2).split(", ").map(a => Number(a))
        let portalDirection = portal.direction.substring(8, portal.direction.length-2).split(", ").map(a => Number(a))
        let portalPoint1 = [portalCenterPoint[0] + portal.radius*portalDirection[0], portalCenterPoint[1] + portal.radius*portalDirection[1]] ;
        let portalPoint2 = [portalCenterPoint[0] - portal.radius*portalDirection[0], portalCenterPoint[1] - portal.radius*portalDirection[1]] ;
        alldoors.push([portalPoint1, portalPoint2])
        let allwalls_new = []
        for (let lineindex = 0; lineindex < allwalls.length; lineindex+=1){
          let line = allwalls[lineindex]
          if (this.pointIsOnLine(portalCenterPoint,line)){
            let endpoint1 = this.getNearerPoint(line[0], [portalPoint1, portalPoint2])
            let endpoint2 = this.getNearerPoint(line[1], [portalPoint1, portalPoint2])
            if (line[0][0] != endpoint1[0] || line[0][1] != endpoint1[1]){
              allwalls_new.push([[line[0][0], line[0][1]], [endpoint1[0], endpoint1[1]]])
            }
            if (line[1][0] != endpoint2[0] || line[1][1] != endpoint2[1]){
              allwalls_new.push([[line[1][0], line[1][1]], [endpoint2[0], endpoint2[1]]])
            }
          }
          else{
            allwalls_new.push(line)
          }
        }
        allwalls = allwalls_new
      }
    }

    for (let w of allwalls){
      let sp = this.convertPointFromDDtoFVTT(w[0])
      let ep = this.convertPointFromDDtoFVTT(w[1])
      let wall = new Wall({
        c : [
          sp[0],
          sp[1],
          ep[0],
          ep[1]
        ]
      });            
      walls.push(wall.data)
    }
    for (let w of alldoors){
      let sp = this.convertPointFromDDtoFVTT(w[0])
      let ep = this.convertPointFromDDtoFVTT(w[1])
      let wall = new Wall({
        c : [
          sp[0],
          sp[1],
          ep[0],
          ep[1]
        ]
      });            
      wall.data.door = true;
      walls.push(wall.data)
    }

    return walls
  }

  static pointIsOnLine(point, line)
  {
    var slopedenom = (line[0][0] - line[1][0])
    var slopenom = (line[0][1] - line[1][1])
    if (slopedenom == 0){
      if (point[0] == line[0][0]){
        if ( (point[1] < line[1][1] && point[1] > line[0][1]) ||
          (point[1] > line[1][1] && point[1] < line[0][1])){
          return true
        }
      }
      return false
    }
    var slope = slopenom/slopedenom
    var intercept = line[1][1] - slope * line[1][0]

    return (point[1] == (slope * point[0] + intercept))
  }

  static pointsDistance(point1, point2){
    return Math.sqrt(((point2[0] - point1[0])**2) + (point2[1] - point1[1])**2);
  }

  static getNearerPoint(from, points){
    if (this.pointsDistance(from, points[0]) < this.pointsDistance(from, points[1]))
      return points[0]
    return points[1]
  }

  static findDoorPoints(ddPortal)
  {
    let ddPortalString = ddPortals.position;
    let offsetX = canvas.dimensions.paddingX;
    let offsetY = canvas.dimensions.paddingY;
    let ddScale = canvas.grid.size/256

    let point1 = ddPortalString.substring(9, ddPortalString.length-2).split(", ").map(a => Number(a)*ddScale)
    point1[0]+=offsetX;
    point1[1]+=offsetY;
    let point2 = duplicate(point1);


    let adjustX = Math.cos(ddPortals.rotation) * canvas.grid.size/2;
    let adjustY = Math.sin(ddPortals.rotation) * canvas.grid.size/2;

    point1[0]+=adjustX;
    point1[1]+=adjustY;

    adjustX = Math.cos(ddPortals.rotation+Math.PI) * canvas.grid.size/2;
    adjustY = Math.sin(ddPortals.rotation+Math.PI) * canvas.grid.size/2;

    point2[0]+=adjustX;
    point2[1]+=adjustY;

    return point1, point2
  }

  static GetLights(file, level)
  {
    let lights = [];
    for (let index in file.world.levels[level].lights)
    {
      if (!isNaN(index))
      {
        let ddPointString = file.world.levels[level].lights[index].position
        let ddLight = file.world.levels[level].lights[index]
        let points = ddPointString.substring(9, ddPointString.length-2).split(", ").map(a => Number(a))
        let offsetX = canvas.dimensions.paddingX;
        let offsetY = canvas.dimensions.paddingY;
        let ddScale = canvas.grid.size/256

        let light = new AmbientLight({
          t: "l",
          x: (points[0]*ddScale)+offsetX,
          y: (points[1]*ddScale)+offsetY,
          rotation: 0,
          dim: ddLight.range*2,
          bright: ddLight.range,
          angle: 360,
          tintColor: "#" + ddLight.color.substring(2),
          tintAlpha: 0.05
        })
        lights.push(light.data);
      }
    }
    return lights;
  }
}

Hooks.on("ready", ev => {
  canvas.stage.on('mousedown', (ev) => console.log(ev.data.destination.x - 768, ev.data.destination.y -768));
})
