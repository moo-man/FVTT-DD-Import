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

static DDImport(scene, file)
{

    scene.update({"walls" : this.GetWalls(file)});
    scene.update({"lights" : this.GetLights(file)});
 
}

static GetWalls(file)
{
    let walls = [];
    for (let index in file.world.levels[0].walls)
    {
        if (!isNaN(index))
        {
        let ddWalls = file.world.levels[0].walls[index]
        let wallSet = []
        let doors = ddWalls.portals.length > 0;
        let ddPointString = ddWalls.points;
        let points = ddPointString.substring(18, ddPointString.length-2).split(", ").map(a => Number(a))
        let offsetX = canvas.dimensions.paddingX;
        let offsetY = canvas.dimensions.paddingY;
        let ddScale = canvas.grid.size/256


        for(let i = 0; i < points.length-3; i+=2)
        {
            let wall = new Wall({
                c : [(points[i]*ddScale)+offsetX, (points[i+1]*ddScale)+offsetY, (points[i+2]*ddScale)+offsetX, (points[i+3]*ddScale)+offsetY],
                });
            if (doors){
                wall.data.door = CONST.WALL_DOOR_TYPES.DOOR

            }
            
            wallSet.push(wall.data)
        }
        if (wallSet.length >=2 )
            wallSet.push(new Wall({
                c: [wallSet[0].c[0], wallSet[0].c[1], wallSet[wallSet.length-1].c[2], wallSet[wallSet.length-1].c[3]]
            }).data)
        walls = walls.concat(wallSet);
        }
    }



    
    for (let index in file.world.levels[0].portals)
    {
        if (!isNaN(index))
        {
        let ddPortals = file.world.levels[0].portals[index]
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
        


        let wall = new Wall({
            c : [point1[0], point1[1], point2[0], point2[1]],
            });
            wall.data.door = CONST.WALL_DOOR_TYPES.DOOR
            walls.push(wall.data) 

        }
    }  


    return walls
}

static GetLights(file)
{
    let lights = [];
    for (let index in file.world.levels[0].lights)
    {
        if (!isNaN(index))
        {
        let ddPointString = file.world.levels[0].lights[index].position
        let ddLight = file.world.levels[0].lights[index]
        let points = ddPointString.substring(9, ddPointString.length-2).split(", ").map(a => Number(a))
        let offsetX = canvas.dimensions.paddingX;
        let offsetY = canvas.dimensions.paddingY;
        let ddScale = canvas.grid.size/256

        let light = new AmbientLight({
            t: "l",
            x: (points[0]*ddScale)+offsetX,
            y: (points[1]*ddScale)+offsetY,
            rotation: 0,
            dim: ddLight.range,
            bright: ddLight.range/2,
            angle: 360,
            tintColor: "#" + ddLight.color.substring(2),
            tintAlpha: 0.05
        })
        lights.push(light.data);
        console.log(light.data.tintColor);
        }
    }
    return lights;
}
}

Hooks.on("ready", ev => {
    canvas.stage.on('mousedown', (ev) => console.log(ev.data.destination.x - 768, ev.data.destination.y -768));
})