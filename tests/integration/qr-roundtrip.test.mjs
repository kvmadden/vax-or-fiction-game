import test from 'node:test';
import assert from 'node:assert/strict';
import jsQR from 'jsqr';
import { generateQrMatrix as generate } from '../../src/components/qr-matrix.ts';
for(const room of ['Mixed-Case_123','x'.repeat(64)]) test(`QR decodes exact room length ${room.length}`,()=>{
 const text=`https://vaxorfiction.com/?vote=1&room=${room}`;
 const matrix=generate(text), quiet=4,cell=8,width=(matrix.length+quiet*2)*cell;
 const data=new Uint8ClampedArray(width*width*4).fill(255);
 for(let r=0;r<matrix.length;r++)for(let c=0;c<matrix.length;c++)if(matrix[r][c])for(let y=0;y<cell;y++)for(let x=0;x<cell;x++){const i=(((r+quiet)*cell+y)*width+(c+quiet)*cell+x)*4;data[i]=data[i+1]=data[i+2]=0;}
 assert.equal(jsQR(data,width,width)?.data,text);
});
