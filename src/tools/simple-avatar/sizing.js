function randomFloat(min, max) {
    return Math.random() * (max - min) + min;
}
export default class sizing{
    constructor(base, minMultiplier, maxMultiplier){
      this.base = base;
      this.size = base;
      this.minMultiplier = minMultiplier;
      this.maxMultiplier = maxMultiplier;
    }
    randomize(){
      this.size = this.base * randomFloat(this.minMultiplier, this.maxMultiplier);
    }
    getSize(){
      return this.size;
    }
  }
