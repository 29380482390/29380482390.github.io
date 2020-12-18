minimalNix = {}
cyberpunkBlack =  {} 
horizonDark = {}
 solarizedDark = {
    base04: "#000000", //not sure here
    base03:  "#002b37",
    base02:  "#073642",
    base01:  "#586e75",
    base00:  "#657b83",
    base0:  "#839496",
    base1:  "#93a1a1",
    base2:  "#eee8d5",
    base3: "#fdf6e3",
    yellow:  "#b58900",
    orange:  "#cb4b16",
    red:     "#dc322f",
    magenta: "#d33682",
    violet:  "#6c71c4",
    blue:    "#268bd2",
    cyan:    "#2aa198",
    green:   "#859900"
 }           
gruvboxDark = {
    base04:  "#1D2021",
    base03:  "#282828",
    base02:  "#3c3836",
    base01:  "#7c6f64",
    base00:  "#7c6f64",
    base0:   "#928374",
    base1:   "#928374",
    base2:   "#f9f5d7",
    base3:   "#f2e5bc",
    dark1:   "#504945",
    dark2:   "#665c54",
    red:     "#fb4934",
    green:   "#b8bb26",
    yellow:  "#fabd2f",
    blue:    "#83a598",
    magenta: "#d3869b",
    cyan:    "#8ec07c",
    orange:  "#fe8019"
} 
cyberpunkLowContrast = { // ten
    base04:  "#0F111A", 
    base03:  "#191919",
    base02:  "#0F111A",
    base01:  "#464B5D",
    base00:  "#3B3F51",
    base0:   "#8F93A2",
    base1:   "#8F93A2",
    base2:   "#ffffff",
    base3:   "#ffffff",
    red: "#ff5370",
    green: "#c3e88d",
    yellow: "#ffcb6b",
    blue: "#82aaff",
    magenta: "#c792ea",
    cyan: "#89ddff",
    orange : "#ff5370",
}
materialOcean = {
    base04:  "#0F111A", 
    base03:  "#090B10",
    base02:  "#0F111A",
    base01:  "#464B5D",
    base00:  "#3B3F51",
    base0:   "#8F93A2",
    base1:   "#8F93A2",
    base2:   "#ffffff",
    base3:   "#ffffff",
    red: "#ff5370",
    green: "#c3e88d",
    yellow: "#ffcb6b",
    blue: "#82aaff",
    magenta: "#c792ea",
    cyan: "#89ddff",
    orange : "#ff5370",
}

const availableThemes = [solarizedDark, gruvboxDark, cyberpunkLowContrast, materialOcean, horizonDark]
const themes = [
    'base04', 'base03', 'base02', 'base01', 'dark1', 'dark2', 'base0', 'base1', 'base2', 'base3', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'orange'
]

const cycleThemes = (themeIndex=(Math.floor(Math.random() * availableThemes.length))) => {
    themes.forEach(theme => {
        document.documentElement.style.setProperty(`--${theme}`, availableThemes[themeIndex][theme])
    })
}

cycleThemes(2)
