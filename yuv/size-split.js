const Transform = require('stream').Transform;

class SizeSplitter extends Transform {
  /**
   * @param {number} size
   * @param {*} options
   */
  constructor(chunkSize, options = {}) {
    super(options);

    this.chunkSize = chunkSize;
    this.buffer = new Buffer(this.chunkSize);
    this.buffer.fill(0);
    this.bufferOffset = 0;
  }

  _transform(chunk, encoding, next) {
    // 已经有数据在buffer 中，尝试先填充完它
    if (this.bufferOffset !== 0) {
      const byteNeeded = this.chunkSize - this.bufferOffset;

      if (chunk.length >= byteNeeded) {
        // 足够填满
        chunk.copy(this.buffer, this.bufferOffset, 0, byteNeeded);
        this.push(this.buffer);
        this.bufferOffset = 0;
        // 这里有点怪, 截取的是前部分？
        chunk = chunk.slice(byteNeeded);
      } else {
        chunk.copy(this.buffer, this.bufferOffset);
        this.bufferOffset += chunk.length;
      }
    }

    // buffer 中没有任何数据，直接push
    if (this.bufferOffset === 0) {
      let offset = 0,
        size = chunk.length;

      while (size >= this.chunkSize) {
        this.push(chunk.slice(offset, offset + this.chunkSize));
        offset += this.chunkSize;
        size -= this.chunkSize;
      }

      const remainingChunk = chunk.slice(offset, offset + size);

      if (remainingChunk.length) {
        remainingChunk.copy(this.buffer, this.bufferOffset);
        this.bufferOffset += remainingChunk.length;
      }
    }

    next();
  }

  _flush(next) {
    if (this.bufferOffset) {
      this.push(this.buffer.slice(0, this.bufferOffset));
      next();
    }
  }
}

module.exports = SizeSplitter;
