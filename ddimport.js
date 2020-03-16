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

static GetWalls(file, level)
{
    let walls = [];
    let ddPortalList = [];
    for (let index in file.world.levels[level].walls)
    {
        if (!isNaN(index))
        {
            let ddWalls = file.world.levels[level].walls[index]
            let wallSet = []
            let ddPointString = ddWalls.points;
            let points = ddPointString.substring(18, ddPointString.length-2).split(", ").map(a => Number(a))
            let offsetX = canvas.dimensions.paddingX;
            let offsetY = canvas.dimensions.paddingY;
            let ddScale = canvas.grid.size/256

         /*   if (ddWalls.portals)
            {
                for(let i = 0; i < points.length-3; i+=2)
                {
                    let point1 = [(points[i]*ddScale)+offsetX, (points[i+1]*ddScale)+offsetY]
                    let point2 = [(points[i+2]*ddScale)+offsetX, (points[i+3]*ddScale)+offsetY]

                    let portal = ddWalls.portals[0];
                    let portalPoints = this.findDoorPoints(portal);
                    if (this.pointIsOnLine([portalPoints[0], portalPoints[1]], point1.concat(point2)))
                    {

                    }
                    else if (this.pointIsOnLine([portalPoints[2], portalPoints[3]], point1.concat(point2)))
                    {
                        
                    }

                    let wall = new Wall({
                        c : [(points[i]*ddScale)+offsetX, (points[i+1]*ddScale)+offsetY, (points[i+2]*ddScale)+offsetX, (points[i+3]*ddScale)+offsetY],
                        });            
                    wallSet.push(wall.data)
                }

                if (wallSet.length % 2 != 0)
                    wallSet.push(new Wall({
                        c: [wallSet[0].c[0], wallSet[0].c[1], wallSet[wallSet.length-1].c[2], wallSet[wallSet.length-1].c[3]]
                    }).data)
                    
                walls = walls.concat(wallSet);
            }*/
             for(let i = 0; i < points.length-3; i+=2)
                {
                        
                    let wall = new Wall({
                        c : [(points[i]*ddScale)+offsetX, (points[i+1]*ddScale)+offsetY, (points[i+2]*ddScale)+offsetX, (points[i+3]*ddScale)+offsetY],
                        });            
                    wallSet.push(wall.data)
                }

                if (wallSet.length % 2 != 0)
                    wallSet.push(new Wall({
                        c: [wallSet[0].c[0], wallSet[0].c[1], wallSet[wallSet.length-1].c[2], wallSet[wallSet.length-1].c[3]]
                    }).data)
                    
                walls = walls.concat(wallSet);
        }

    }


    // ddPortalList = ddPortalList.concat(file.world.levels[level].portals)
    // for (let index in ddPortalList)
    // {
    //     if (!isNaN(index))
    //     {
    //         let ddPortal = ddPortalList[index]
    //         let point1, point2 = this.findDoorPoints(ddPortal)
    //         let wall = new Wall({
    //             c : [point1[0], point1[1], point2[0], point2[1]],
    //             });
    //             wall.data.door = CONST.WALL_DOOR_TYPES.DOOR
    //             walls.push(wall.data) 

    //     }
    // }  


    return walls
}

static pointIsOnLine(point, line)
{
    slope = (line[1] - line[3])/(line[0] - line[2])
    intercept = line[3] - slope * line[2]

    return (point[1] == (slope * point[0] + intercept))
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