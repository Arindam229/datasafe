import { googledata } from "../public/data.js"
    let sizegoogle = Object.keys(googledata).length;
    console.log(sizegoogle)
    var xValues = ['google'];
var yValues = [sizegoogle];
var barColors = ["blue"];

new Chart("#myChart", {
  type: "bar",
  data: {
    labels: xValues,
    datasets: [{
      backgroundColor: barColors,
      data: yValues
    }]
  },
  options: {}
});