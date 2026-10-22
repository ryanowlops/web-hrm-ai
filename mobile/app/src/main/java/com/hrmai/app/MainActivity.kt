package com.hrmai.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.hrmai.app.core.ui.theme.HrmTheme
import com.hrmai.app.navigation.HrmNavHost

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val container = (application as HrmApplication).container
        setContent {
            HrmTheme {
                HrmNavHost(container = container)
            }
        }
    }
}
