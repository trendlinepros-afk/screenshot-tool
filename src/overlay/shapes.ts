export interface Point {
  x: number;
  y: number;
}

export type Shape =
  | { tool: 'pen'; points: Point[]; color: string; width: number }
  | { tool: 'line'; from: Point; to: Point; color: string; width: number }
  | { tool: 'arrow'; from: Point; to: Point; color: string; width: number }
  | { tool: 'box'; from: Point; to: Point; color: string; width: number }
  | { tool: 'text'; x: number; y: number; text: string; color: string; fontSize: number };

export type ToolName = 'pen' | 'line' | 'arrow' | 'box' | 'text';

export function drawShape(ctx: CanvasRenderingContext2D, shape: Shape): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (shape.tool) {
    case 'pen': {
      if (shape.points.length < 2) break;
      ctx.strokeStyle = shape.color;
      ctx.lineWidth = shape.width;
      ctx.beginPath();
      ctx.moveTo(shape.points[0].x, shape.points[0].y);
      for (let i = 1; i < shape.points.length; i++) {
        ctx.lineTo(shape.points[i].x, shape.points[i].y);
      }
      ctx.stroke();
      break;
    }
    case 'line': {
      ctx.strokeStyle = shape.color;
      ctx.lineWidth = shape.width;
      ctx.beginPath();
      ctx.moveTo(shape.from.x, shape.from.y);
      ctx.lineTo(shape.to.x, shape.to.y);
      ctx.stroke();
      break;
    }
    case 'arrow': {
      ctx.strokeStyle = shape.color;
      ctx.fillStyle = shape.color;
      ctx.lineWidth = shape.width;
      const { from, to } = shape;
      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      const headLen = Math.max(10, shape.width * 4);
      // shorten the shaft so it doesn't poke out of the arrowhead
      const shaftEnd = {
        x: to.x - Math.cos(angle) * headLen * 0.6,
        y: to.y - Math.sin(angle) * headLen * 0.6,
      };
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(shaftEnd.x, shaftEnd.y);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(to.x, to.y);
      ctx.lineTo(
        to.x - headLen * Math.cos(angle - Math.PI / 6),
        to.y - headLen * Math.sin(angle - Math.PI / 6)
      );
      ctx.lineTo(
        to.x - headLen * Math.cos(angle + Math.PI / 6),
        to.y - headLen * Math.sin(angle + Math.PI / 6)
      );
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'box': {
      ctx.strokeStyle = shape.color;
      ctx.lineWidth = shape.width;
      ctx.strokeRect(
        Math.min(shape.from.x, shape.to.x),
        Math.min(shape.from.y, shape.to.y),
        Math.abs(shape.to.x - shape.from.x),
        Math.abs(shape.to.y - shape.from.y)
      );
      break;
    }
    case 'text': {
      ctx.fillStyle = shape.color;
      ctx.font = `600 ${shape.fontSize}px "Segoe UI", system-ui, sans-serif`;
      ctx.textBaseline = 'top';
      const lines = shape.text.split('\n');
      lines.forEach((line, i) => {
        ctx.fillText(line, shape.x, shape.y + i * shape.fontSize * 1.25);
      });
      break;
    }
  }
  ctx.restore();
}
