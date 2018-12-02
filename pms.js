"use strict";

const Pms = (function() {

class PmsFile {
    constructor() {
        this.version = 0;
        this.name = "";
        this.texture = "";
        this.backgroundColorTop = Color.rgba(0, 0, 0, 0);
        this.backgroundColorBottom = Color.rgba(0, 0, 0, 0);
        this.jetAmount = 0;
        this.grenades = 0;
        this.medikits = 0;
        this.weather = 0;
        this.steps = 0;
        this.randId = 0;
        this.polygons = [];
        this.sectorDivision = 0;
        this.numSectors = 25;
        this.sectors = [];
        this.props = [];
        this.scenery = [];
        this.colliders = [];
        this.spawnPoints = [];
        this.wayPoints = [];
    }

    generateSectors() {
        function bankersRound(x) {
            const n = Math.fround(x);
            const r = Math.round(n);
            return Math.abs(n) % 1 === 0.5 ? (r % 2 === 0 ? r : r - 1) : r;
        }

        const d = this.sectorDivision;
        const n = this.numSectors;
        const sectors = Array.from({length: (2*n + 1) * (2*n + 1)}, v => []);
        let polyIndex = 1;

        for (const polygon of this.polygons) {
            if (polygon.type !== 3) {
                const xx = polygon.vertices.map(v => v.x);
                const yy = polygon.vertices.map(v => v.y);
                const x0 = Math.max(-n, bankersRound((Math.min(...xx) - 1) / d));
                const x1 = Math.min( n, bankersRound((Math.max(...xx) + 1) / d));
                const y0 = Math.max(-n, bankersRound((Math.min(...yy) - 1) / d));
                const y1 = Math.min( n, bankersRound((Math.max(...yy) + 1) / d));

                for (let x = x0; x <= x1; x++) {
                    for (let y = y0; y <= y1; y++) {
                        const rect = [d * (x - 0.5) - 1, d * (y - 0.5) - 1, d + 2, d + 2];
                        const tri = [].concat(...polygon.vertices.map(v => [v.x, v.y]));

                        if (Geometry.rectIntersectsTriangle(...rect, ...tri)) {
                            sectors[(n + x) * (2*n + 1) + (n + y)].push(polyIndex);
                        }
                    }
                }
            }

            polyIndex++;
        }

        return sectors;
    }

    toArrayBuffer() {
        const w = new BufferWriter();

        w.bgra = function(color) {
            w.u8(color[2]);
            w.u8(color[1]);
            w.u8(color[0]);
            w.u8(color[3]);
        };

        // header

        w.i32(this.version);
        w.str(this.name, 38);
        w.str(this.texture, 24);
        w.bgra(this.backgroundColorTop);
        w.bgra(this.backgroundColorBottom);
        w.i32(this.jetAmount);
        w.u8(this.grenades);
        w.u8(this.medikits);
        w.u8(this.weather);
        w.u8(this.steps);
        w.i32(this.randId);

        // polygons

        w.i32(this.polygons.length);

        for (const polygon of this.polygons) {
            for (const vertex of polygon.vertices) {
                w.f32(vertex.x);
                w.f32(vertex.y);
                w.f32(vertex.z);
                w.f32(vertex.rhw);
                w.bgra(vertex.color);
                w.f32(vertex.u);
                w.f32(vertex.v);
            }

            for (const normal of polygon.normals) {
                w.f32(normal.x);
                w.f32(normal.y);
                w.f32(normal.z);
            }

            w.u8(polygon.type);
        }

        // sectors

        w.i32(this.sectorDivision);
        w.i32(this.numSectors);

        for (const sector of this.sectors) {
            w.u16(sector.length);

            for (const polyIndex of sector) {
                w.u16(polyIndex);
            }
        }

        // props

        w.i32(this.props.length);

        for (const prop of this.props) {
            w.u8(prop.active);
            w.skip(1);
            w.u16(prop.style);
            w.i32(prop.width);
            w.i32(prop.height);
            w.f32(prop.x);
            w.f32(prop.y);
            w.f32(prop.rotation);
            w.f32(prop.scaleX);
            w.f32(prop.scaleY);
            w.u8(prop.alpha);
            w.skip(3);
            w.bgra(prop.color);
            w.u8(prop.level);
            w.skip(3);
        }

        // scenery

        w.i32(this.scenery.length);

        for (const scenery of this.scenery) {
            w.str(scenery.name, 50);
            w.u16(scenery.timestamp.timeValue);
            w.u16(scenery.timestamp.dateValue);
        }

        // colliders

        w.i32(this.colliders.length);

        for (const collider of this.colliders) {
            w.u8(collider.active);
            w.skip(3);
            w.f32(collider.x);
            w.f32(collider.y);
            w.f32(collider.radius);
        }

        // spawn points

        w.i32(this.spawnPoints.length);

        for (const spawnPoint of this.spawnPoints) {
            w.u8(spawnPoint.active);
            w.skip(3);
            w.i32(spawnPoint.x);
            w.i32(spawnPoint.y);
            w.u32(spawnPoint.team);
        }

        // way points

        w.i32(this.wayPoints.length);

        for (const wayPoint of this.wayPoints) {
            w.u8(wayPoint.active);
            w.skip(3);
            w.i32(wayPoint.id);
            w.i32(wayPoint.x);
            w.i32(wayPoint.y);
            w.u8(wayPoint.left);
            w.u8(wayPoint.right);
            w.u8(wayPoint.up);
            w.u8(wayPoint.down);
            w.u8(wayPoint.jet);
            w.u8(wayPoint.path);
            w.u8(wayPoint.action);
            w.u8(wayPoint.c2);
            w.u8(wayPoint.c3);
            w.skip(3);
            w.i32(Math.min(20, wayPoint.connections.length));

            for (const connection of wayPoint.connections.slice(0, 20)) {
                w.i32(connection);
            }

            w.skip(4 * Math.max(0, 20 - wayPoint.connections.length));
        }

        return w.truncate();
    }

    static fromArrayBuffer(arrayBuffer) {
        const r = new BufferReader(arrayBuffer);
        const map = new PmsFile();

        // header

        map.version = r.i32();
        map.name = r.str(38);
        map.texture = r.str(24);
        map.backgroundColorTop = Color.bgra(r.u8(), r.u8(), r.u8(), r.u8());
        map.backgroundColorBottom = Color.bgra(r.u8(), r.u8(), r.u8(), r.u8());
        map.jetAmount = r.i32();
        map.grenades = r.u8();
        map.medikits = r.u8();
        map.weather = r.u8();
        map.steps = r.u8();
        map.randId = r.i32();

        // polygons

        for (let i = 0, n = r.i32(); i < n; i++) {
            const polygon = new Polygon();

            for (let j = 0; j < 3; j++) {
                polygon.vertices[j].x = r.f32();
                polygon.vertices[j].y = r.f32();
                polygon.vertices[j].z = r.f32();
                polygon.vertices[j].rhw = r.f32();
                polygon.vertices[j].color = Color.bgra(r.u8(), r.u8(), r.u8(), r.u8());
                polygon.vertices[j].u = r.f32();
                polygon.vertices[j].v = r.f32();
            }

            for (let j = 0; j < 3; j++) {
                polygon.normals[j].x = r.f32();
                polygon.normals[j].y = r.f32();
                polygon.normals[j].z = r.f32();
            }

            polygon.type = r.u8();
            map.polygons.push(polygon);
        }

        // sectors

        map.sectorDivision = r.i32();
        map.numSectors = r.i32();

        for (let i = 0, n = 2 * map.numSectors + 1, m = n * n; i < m; i++) {
            const sector = [];

            for (let j = 0, n = r.u16(); j < n; j++) {
                sector.push(r.u16());
            }

            map.sectors.push(sector);
        }

        // props

        for (let i = 0, n = r.i32(); i < n; i++) {
            const prop = new Prop();
            prop.active = !!r.u8();
            r.skip(1);
            prop.style = r.u16();
            prop.width = r.i32();
            prop.height = r.i32();
            prop.x = r.f32();
            prop.y = r.f32();
            prop.rotation = r.f32();
            prop.scaleX = r.f32();
            prop.scaleY = r.f32();
            prop.alpha = r.u8();
            r.skip(3);
            prop.color = Color.bgra(r.u8(), r.u8(), r.u8(), r.u8());
            prop.level = r.u8();
            r.skip(3);
            map.props.push(prop);
        }

        // scenery

        for (let i = 0, n = r.i32(); i < n; i++) {
            const scenery = new Scenery();
            scenery.name = r.str(50);
            scenery.timestamp.timeValue = r.u16();
            scenery.timestamp.dateValue = r.u16();
            map.scenery.push(scenery);
        }

        // colliders

        for (let i = 0, n = r.i32(); i < n; i++) {
            const collider = new Collider();
            collider.active = !!r.u8();
            r.skip(3);
            collider.x = r.f32();
            collider.y = r.f32();
            collider.radius = r.f32();
            map.colliders.push(collider);
        }

        // spawn points

        for (let i = 0, n = r.i32(); i < n; i++) {
            const spawnPoint = new SpawnPoint();
            spawnPoint.active = !!r.u8();
            r.skip(3);
            spawnPoint.x = r.i32();
            spawnPoint.y = r.i32();
            spawnPoint.team = r.u32();
            map.spawnPoints.push(spawnPoint);
        }

        // way points

        for (let i = 0, n = r.i32(); i < n; i++) {
            const wayPoint = new WayPoint();
            wayPoint.active = !!r.u8();
            r.skip(3);
            wayPoint.id = r.i32();
            wayPoint.x = r.i32();
            wayPoint.y = r.i32();
            wayPoint.left = !!r.u8();
            wayPoint.right = !!r.u8();
            wayPoint.up = !!r.u8();
            wayPoint.down = !!r.u8();
            wayPoint.jet = !!r.u8();
            wayPoint.path = r.u8();
            wayPoint.action = r.u8();
            wayPoint.c2 = r.u8();
            wayPoint.c3 = r.u8();
            r.skip(3);

            const count = r.i32();

            for (let j = 0; j < count; j++) {
                wayPoint.connections.push(r.i32());
            }

            r.skip(4 * Math.max(0, 20 - count));
            map.wayPoints.push(wayPoint);
        }

        return map;
    }
}

class Color {
    static rgba(r, g, b, a) {
        return [r, g, b, a];
    }

    static bgra(b, g, r, a) {
        return [r, g, b, a];
    }
}

class Vec3 {
    constructor(x, y, z) {
        this.x = x || 0;
        this.y = y || 0;
        this.z = z || 0;
    }
}

class Vertex {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.z = 0;
        this.rhw = 0;
        this.color = Color.rgba(0, 0, 0, 0);
        this.u = 0;
        this.v = 0;
    }
}

class Polygon {
    constructor() {
        this.vertices = [new Vertex(), new Vertex(), new Vertex()];
        this.normals = [new Vec3(), new Vec3(), new Vec3()];
        this.type = 0;
    }
}

class Prop {
    constructor() {
        this.active = true;
        this.style = 0;
        this.width = 0;
        this.height = 0;
        this.x = 0;
        this.y = 0;
        this.rotation = 0;
        this.scaleX = 0;
        this.scaleY = 0;
        this.alpha = 0;
        this.color = Color.rgba(0, 0, 0, 0);
        this.level = 0;
    }
}

class Timestamp {
    constructor() {
        this.timeValue = 0;
        this.dateValue = 0;
    }
}

class Scenery {
    constructor() {
        this.name = "";
        this.timestamp = new Timestamp();
    }
}

class Collider {
    constructor() {
        this.active = true;
        this.x = 0;
        this.y = 0;
        this.radius = 0;
    }
}

class SpawnPoint {
    constructor() {
        this.active = true;
        this.x = 0;
        this.y = 0;
        this.team = 0;
    }
}

class WayPoint {
    constructor() {
        this.active = true;
        this.id = 0;
        this.x = 0;
        this.y = 0;
        this.left = false;
        this.right = false;
        this.up = false;
        this.down = false;
        this.jet = false;
        this.path = 0;
        this.action = 0;
        this.c2 = 0;
        this.c3 = 0;
        this.connections = [];
    }
}

class Geometry {
    static rectContainsPoint(x, y, w, h, px, py) {
        return x <= px && px <= x + w && y <= py && py <= y + h;
    }

    static segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
        const ccw = (ax, ay, bx, by, cx, cy) => (cy - ay) * (bx - ax) > (by - ay) * (cx - ax);
        return ccw(ax, ay, cx, cy, dx, dy) !== ccw(bx, by, cx, cy, dx, dy) &&
            ccw(ax, ay, bx, by, cx, cy) !== ccw(ax, ay, bx, by, dx, dy);
    }

    static triangleContainsPoint(ax, ay, bx, by, cx, cy, x, y) {
        const A = 0.5 * (-by * cx + ay * (-bx + cx) + ax * (by - cy) + bx * cy);
        const sign = A < 0 ? -1 : 1;
        const s = (ay * cx - ax * cy + (cy - ay) * x + (ax - cx) * y) * sign;
        const t = (ax * by - ay * bx + (ay - by) * x + (bx - ax) * y) * sign;
        return s >= 0 && t >= 0 && (s + t) <= (2 * A * sign);
    }

    static rectIntersectsTriangle(x, y, w, h, ax, ay, bx, by, cx, cy) {
        return Geometry.rectContainsPoint(x, y, w, h, ax, ay) ||
            Geometry.rectContainsPoint(x, y, w, h, bx, by) ||
            Geometry.rectContainsPoint(x, y, w, h, cx, cy) ||
            Geometry.triangleContainsPoint(ax, ay, bx, by, cx, cy, x + 0, y + 0) ||
            Geometry.triangleContainsPoint(ax, ay, bx, by, cx, cy, x + w, y + 0) ||
            Geometry.triangleContainsPoint(ax, ay, bx, by, cx, cy, x + w, y + h) ||
            Geometry.triangleContainsPoint(ax, ay, bx, by, cx, cy, x + 0, y + h) ||
            Geometry.segmentsIntersect(x + 0, y + 0, x + w, y + 0, ax, ay, bx, by) ||
            Geometry.segmentsIntersect(x + 0, y + 0, x + w, y + 0, bx, by, cx, cy) ||
            Geometry.segmentsIntersect(x + 0, y + 0, x + w, y + 0, cx, cy, ax, ay) ||
            Geometry.segmentsIntersect(x + w, y + 0, x + w, y + h, ax, ay, bx, by) ||
            Geometry.segmentsIntersect(x + w, y + 0, x + w, y + h, bx, by, cx, cy) ||
            Geometry.segmentsIntersect(x + w, y + 0, x + w, y + h, cx, cy, ax, ay) ||
            Geometry.segmentsIntersect(x + w, y + h, x + 0, y + h, ax, ay, bx, by) ||
            Geometry.segmentsIntersect(x + w, y + h, x + 0, y + h, bx, by, cx, cy) ||
            Geometry.segmentsIntersect(x + w, y + h, x + 0, y + h, cx, cy, ax, ay) ||
            Geometry.segmentsIntersect(x + 0, y + h, x + 0, y + 0, ax, ay, bx, by) ||
            Geometry.segmentsIntersect(x + 0, y + h, x + 0, y + 0, bx, by, cx, cy) ||
            Geometry.segmentsIntersect(x + 0, y + h, x + 0, y + 0, cx, cy, ax, ay);
    }
}

class BufferReader {
    constructor(arrayBuffer) {
        this.offset = 0;
        this.view = new DataView(arrayBuffer);
    }

    skip(byteCount) {
        this.offset += byteCount;
    }

    read(methodName, byteCount) {
        if (this.offset + byteCount <= this.view.byteLength) {
            const value = this.view[methodName](this.offset, true);
            this.offset += byteCount;
            return value;
        }

        return 0;
    }

    str(maxLength) {
        const length = this.u8();
        const values = [];

        for (let i = 0; i < length; i++) {
            values.push(this.u8());
        }

        this.skip(Math.max(0, maxLength - length));
        return String.fromCharCode.apply(null, values);
    }

    i8() { return this.read("getInt8", 1); }
    u8() { return this.read("getUint8", 1); }
    i16() { return this.read("getInt16", 2); }
    u16() { return this.read("getUint16", 2); }
    i32() { return this.read("getInt32", 4); }
    u32() { return this.read("getUint32", 4); }
    f32() { return this.read("getFloat32", 4); }
}

class BufferWriter {
    constructor() {
        this.length = 0;
        this.view = new DataView(new ArrayBuffer(1024));
    }

    truncate() {
        if (this.length < this.view.buffer.byteLength) {
            this.view = new DataView(ArrayBuffer.transfer(this.view.buffer, this.length));
        }

        return this.view.buffer;
    }

    skip(byteCount) {
        for (let i = 0; i < byteCount; i++) {
            this.u8(0);
        }
    }

    write(methodName, value, byteCount) {
        if (this.length + byteCount > this.view.byteLength) {
            this.view = new DataView(ArrayBuffer.transfer(this.view.buffer, 2 * this.view.byteLength));
        }

        this.view[methodName](this.length, value, true);
        this.length += byteCount;
    }

    str(text, maxLength) {
        maxLength = Math.min(maxLength, 255);
        const length = Math.min(text.length, maxLength);

        this.u8(length);

        for (let i = 0; i < length; i++) {
            this.u8(text.charCodeAt(i));
        }

        for (let i = length; i < maxLength; i++) {
            this.u8(0);
        }
    }

    i8(value) { return this.write("setInt8", value, 1); }
    u8(value) { return this.write("setUint8", value, 1); }
    i16(value) { return this.write("setInt16", value, 2); }
    u16(value) { return this.write("setUint16", value, 2); }
    i32(value) { return this.write("setInt32", value, 4); }
    u32(value) { return this.write("setUint32", value, 4); }
    f32(value) { return this.write("setFloat32", value, 4); }
}

if (!ArrayBuffer.transfer) {
    ArrayBuffer.transfer = function(source, length) {
        if (!(source instanceof ArrayBuffer))
            throw new TypeError("Source must be an instance of ArrayBuffer");
        if (length <= source.byteLength)
            return source.slice(0, length);
        const sourceView = new Uint8Array(source),
            destView = new Uint8Array(new ArrayBuffer(length));
        destView.set(sourceView);
        return destView.buffer;
    };
}

return {
    PmsFile,
    Color,
    Vec3,
    Vertex,
    Polygon,
    Prop,
    Timestamp,
    Scenery,
    Collider,
    SpawnPoint,
    WayPoint,
    Geometry,
    BufferReader,
    BufferWriter
};

}());
