const log = console.log;
let PIXEL_SIZE = 3;

const front_canvas = document.createElement("canvas")
front_canvas.width = 80 * PIXEL_SIZE;
front_canvas.height = 80 * PIXEL_SIZE;
document.body.appendChild(front_canvas);
const front_ctx = front_canvas.getContext('2d');
front_ctx.imageSmoothingEnabled = false;

const back_canvas = document.createElement("canvas");
const back_ctx = back_canvas.getContext("2d");


muted = false;
unitTesting = false;
masterVolume = .25;

const image_names = [
    "t_i",
    "rock_1",
    "particle_circle",
    "particle_block",
];

const DEG_TO_RAD = Math.PI / 180;

let state = {
};

let prev_time = 0;

let center_off = [0,0];
const camera_smoothing_samples_count = 64;
let camera_smoothing_samples = [];

{
    for(let i = 0; i < camera_smoothing_samples_count; i++) {
        camera_smoothing_samples[i] = [0,0];
    }
}

function vec_sub(a, b) {
    return [
        a[0] - b[0],
        a[1] - b[1]
    ];
}

function dot(a, b) {
    return a[0] * b[0] + b[1] * a[1];
}

function vec_len(a) {
    return Math.sqrt(dot(a,a));
}

function vec_copy(a) {
    return [a[0], a[1]];
}

function is_point_in_circle(
        point,
        origin,
        radius
) {
    const origin_to_point = [
        point[0] - origin[0],
        point[1] - origin[1]
    ];

    const otp_length_sq = dot(origin_to_point, origin_to_point);

    radius *= radius;

    if(otp_length_sq > radius) {
        return false;
    }

    return true;
}

let mouse_world_no_cam = [0,0];
let is_mouse_down = false;
let was_mouse_down = false;

let guy_pos = [0,0];
let guy_was_selected = false;

let guy_velocity = [0, 0];
let particle_time_accum = 0;

let particles = [];
let rocks = []

const TAU = Math.PI * 2;

const rng = new RNG(String(new Date()));

function sign(x) {
    if(x >= 0) return 1;
    return -1;
}

const guy_radius = 9;
const rock_radius = 8;
let guy_rot = 0;

function clamp(v, min, max) {
    if(min > v) return min;
    if(v > max) return max;
    return v;
}

function particle_emit_smoke(pos) {
    const s = .6 + rng.uniform() * .6;
    const sdx1 = -.05 * rng.uniform();
    const p = {
        position: vec_copy(pos),
        position_1dx: [0,0],
        rotation: rng.uniform() * TAU,
        rotation_1dx: rng.uniform() * TAU,
        scale: [s, s],
        scale_1dx: [sdx1, sdx1],
        image: images["particle_circle"],
    };

    particles.push(p);
}

let explosion_sound_accum = 0;

function explode_rock(rock, impact_mag, count, snd) {
    rock.destroy = true;

    for(let i = 0; i < count; i++) {
        const s = .3 + rng.uniform() * 1;

        const p = {
            lifetime: 5,
            position: vec_copy(rock.position),
            position_1dx: [
                5 + (rng.uniform() * 2 - 1) * impact_mag, 
                5 + (rng.uniform() * 2 - 1) * impact_mag
            ],
            rotation: rng.uniform() * TAU,
            rotation_1dx: rng.uniform() * TAU,
            scale: [s, s],
            image: images["particle_block"],
            intersect_with_rocks: true
        };

        particles.push(p);
    }

    if(snd && explosion_sound_accum > .05) {
        explosion_sound_accum = 0;
        playSound(5234);
    }
}

let prev_pixel_size = 0;
function update(time) {
    const dt = (time - prev_time) / 1000;
    prev_time = time;

    explosion_sound_accum += dt;

    if(prev_pixel_size != PIXEL_SIZE) {
        back_canvas.width = front_canvas.width / PIXEL_SIZE;
        back_canvas.height = front_canvas.height / PIXEL_SIZE;
        back_ctx.imageSmoothingEnabled = false;
        prev_pixel_size = PIXEL_SIZE;
    }

    {
        guy_pos[0] += guy_velocity[0] * dt;
        guy_pos[1] += guy_velocity[1] * dt;

        guy_velocity[0] -= guy_velocity[0] * .02;
        guy_velocity[1] -= guy_velocity[1] * .02;

        const mag_sq = dot(guy_velocity, guy_velocity);
        const mag = Math.sqrt(mag_sq);

        if(mag > 1) {
            guy_rot = Math.atan2(guy_velocity[1], guy_velocity[0]);
        }

        if(mag > 6) {
            PIXEL_SIZE -= ((PIXEL_SIZE / 3)) * dt * 4;
            if(PIXEL_SIZE < 1) {
                PIXEL_SIZE = 1;
            }
        }
        else {
            PIXEL_SIZE += (1 - (PIXEL_SIZE / 3)) * dt * 2;
            if(PIXEL_SIZE > 3) {
                PIXEL_SIZE = 3;
            }
        }

        if(mag > 4) {
            particle_time_accum += dt;

            let t = 1 - clamp((mag - 4) / 100, 0, 1);
            let interval = .1 + t * 2;
            let did_play = false;
            while(particle_time_accum > interval) {
                particle_time_accum -= interval;

                particle_emit_smoke(guy_pos);

                if(!did_play) {
                    playSound(78463);
                    did_play = true;
                }
            }
        }
    }

    {
        for(const rock of rocks) {
            rock.rotation  += rock.rotation_1dx * dt;

            if(is_point_in_circle(guy_pos, rock.position, rock_radius + guy_radius)) {

                const impact_mag = vec_len(guy_velocity) * 2;
                explode_rock(rock, impact_mag, 6, true);
            }
        }
    }

    let camera_pos = [0, 0];
    {
        for(let i = 0; i < camera_smoothing_samples_count - 1; i++) {
            camera_smoothing_samples[i][0] = camera_smoothing_samples[i + 1][0];
            camera_smoothing_samples[i][1] = camera_smoothing_samples[i + 1][1];
        }

        camera_smoothing_samples[camera_smoothing_samples_count - 1][0] = guy_pos[0];
        camera_smoothing_samples[camera_smoothing_samples_count - 1][1] = guy_pos[1];

        for(let i = 0; i < camera_smoothing_samples_count; i++) {
            camera_pos[0] += camera_smoothing_samples[i][0];
            camera_pos[1] += camera_smoothing_samples[i][1];
        }

        camera_pos[0] /= camera_smoothing_samples_count;
        camera_pos[1] /= camera_smoothing_samples_count;
    }


    {
        let nearby_count = 0;
        for(let i = rocks.length - 1; i >= 0; i -= 1) {
            const rock = rocks[i];

            const delta = vec_sub(rock.position, camera_pos);
            const len = vec_len(delta);

            if(rock.destroy || len > 250) {
                rocks.splice(i, 1);
            }
            else {
                nearby_count += 1;
            }
        }

        while(nearby_count < 50) {
            const dir = [
                rng.uniform() * 2 - 1,
                rng.uniform() * 2 - 1
            ];

            const p = [
                camera_pos[0] + (dir[0] * 100) + (sign(dir[0]) * 150),
                camera_pos[1] + (dir[1] * 100) + (sign(dir[1]) * 150)
            ];

            const rock = {
                position: p,
                rotation: rng.uniform() * TAU,
                rotation_1dx: rng.uniform() * TAU * .1
            };

            rocks.push(rock);

            nearby_count += 1;
        }
    }

    const mouse_world = [
        mouse_world_no_cam[0] + camera_pos[0],
        mouse_world_no_cam[1] + camera_pos[1]
    ];

    back_ctx.fillStyle = "black";
	back_ctx.clearRect(0, 0, front_canvas.width, front_canvas.height);
	back_ctx.fillRect(0, 0, front_canvas.width, front_canvas.height);

    back_ctx.save();
    back_ctx.scale(1, -1);
    back_ctx.translate(back_canvas.width * .5, -back_canvas.height * .5);
    back_ctx.translate(-camera_pos[0], -camera_pos[1]);

    const blit_sprite = (img, x, y, r = 0, sx = 1, sy = 1) => {

        back_ctx.save();

        back_ctx.translate(x, y);

        back_ctx.scale(sx, sy);
        back_ctx.rotate(r);
        back_ctx.translate(-img.height * .5, -img.width * .5);

        back_ctx.drawImage(img, 0, 0);

        back_ctx.restore();
    };

    const debug_circle = (px, py, t, col) => {
        back_ctx.beginPath();
        back_ctx.strokeStyle = col;
        back_ctx.arc(px, py, t, 0, Math.PI * 2);
        back_ctx.stroke();
    }

    {
        blit_sprite(images["t_i"], guy_pos[0], guy_pos[1], guy_rot);

        if(is_point_in_circle(mouse_world, guy_pos, guy_radius)) {
            document.body.style.cursor = "grab";
        }
        else {
            document.body.style.cursor = "";
        }

        if(guy_was_selected || 
            (is_mouse_down && is_point_in_circle(mouse_world, guy_pos, guy_radius))
        ) {
            document.body.style.cursor = "grabbing";
            guy_was_selected = true;

            back_ctx.beginPath();
            back_ctx.strokeStyle = "white";
            back_ctx.moveTo(
                guy_pos[0], 
                guy_pos[1]
            );
            back_ctx.lineTo(
                mouse_world[0],
                mouse_world[1],
            );

            back_ctx.stroke();
        }
        else {
        }

        if(!is_mouse_down) {
            if(was_mouse_down && guy_was_selected) {
                const delta = [
                    mouse_world[0] - guy_pos[0],
                    mouse_world[1] - guy_pos[1],
                ];

                guy_velocity[0] += -delta[0];
                guy_velocity[1] += -delta[1];
            }

            guy_was_selected = false;
        }
    }

    for(const rock of rocks) {
        blit_sprite(images["rock_1"], rock.position[0], rock.position[1], rock.rotation);
    }

    {
        for(let particle_index = particles.length - 1; particle_index >= 0; particle_index -= 1) {
            const p = particles[particle_index];
            let kill = false;

            if(p.lifetime != undefined) {
                p.lifetime -= dt;
                if(p.lifetime <= 0) {
                    kill = true;
                }
            }

            p.rotation += p.rotation_1dx * dt;

            if(p.scale_1dx != undefined) {
                p.scale[0] += p.scale_1dx[0] * dt;
                p.scale[1] += p.scale_1dx[1] * dt;
            }

            p.position[0] += p.position_1dx[0] * dt;
            p.position[1] += p.position_1dx[1] * dt;

            if(p.scale[0] <= 0 || p.scale[1] <= 0) {
                kill = true;
            }

            if(p.intersect_with_rocks) {
                const radius = p.scale[0] * .5;

                for(const rock of rocks) {
                    if(is_point_in_circle(p.position, rock.position, radius + rock_radius)) {
                        const impact_mag = vec_len(p.position_1dx) * .2;

                        kill = true;
                        particle_emit_smoke(p.position);
                        explode_rock(rock, impact_mag, 2, false);
                    }
                }
            }

            if(kill) {
                particles.splice(particle_index, 1);
                continue;
            }

            blit_sprite(
                p.image,
                p.position[0], p.position[1],
                p.rotation,
                p.scale[0], p.scale[1]
            );
        }
    }

    back_ctx.restore();

    front_ctx.drawImage(back_canvas, 0, 0, front_canvas.width, front_canvas.height);

    was_mouse_down = is_mouse_down;

    requestAnimationFrame(update);
}

requestAnimationFrame(update);

let images = [];
for(var i=0; i< image_names.length; i++) {
	var image = new Image();

	image.src = image_names[i]+".png";
	images[image_names[i]]=image;
}

function get_mouse_pos(e) {
	var rect = e.target.getBoundingClientRect();
	var scaleX = e.target.width / rect.width;    // relationship bitmap vs. element for X
	var scaleY = e.target.height / rect.height;  // relationship bitmap vs. element for Y

	var clientX=e.clientX;
	var clientY=e.clientY;

	if (scaleX < scaleY){
		scaleX=scaleY;
		clientX-=rect.width/2-(e.target.width/scaleX)/2;
	} else {
		scaleY=scaleX;
		clientY-=rect.height/2-(e.target.height/scaleY)/2;
	}
	var x = (clientX - rect.left) * scaleX;   // scale mouse coordinates after they have
	var y =(clientY - rect.top) * scaleY     // been adjusted to be relative to element

    return [x,y];
}

function on_pointer_move(e) {
    const pos = get_mouse_pos(e);

    pos[0] /= PIXEL_SIZE;
    pos[1] /= PIXEL_SIZE;

    pos[1] *= -1;

    pos[0] -= back_canvas.width * .5;
    pos[1] += back_canvas.height * .5;

    mouse_world_no_cam = pos;
}

function on_pointer_release(e) {
    is_mouse_down = false;
}

function on_pointer_click(e) {
    is_mouse_down = true;
}

front_canvas.addEventListener("pointerdown",on_pointer_click);
front_canvas.addEventListener("pointerup",on_pointer_release);
front_canvas.addEventListener("pointermove",on_pointer_move);


