package net.pymasters.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File
import java.nio.ByteBuffer

class IconResourcesTest {

    private fun resolveResDir(): File {
        val candidates = listOf(
            File("src/main/res"),
            File("app/src/main/res"),
            File("android/app/src/main/res"),
        )
        return candidates.firstOrNull { it.isDirectory }
            ?: error("Could not locate android/app/src/main/res from ${File(".").absolutePath}")
    }

    private fun readPngDimensions(file: File): Pair<Int, Int> {
        val bytes = file.readBytes()
        assertTrue("${file.path} must be a valid PNG", bytes.size >= 24)
        val sig = bytes.sliceArray(0 until 8)
        assertTrue(
            "${file.path} missing PNG header signature",
            sig.contentEquals(byteArrayOf(-119, 80, 78, 71, 13, 10, 26, 10)),
        )
        val width = ByteBuffer.wrap(bytes, 16, 4).int
        val height = ByteBuffer.wrap(bytes, 20, 4).int
        return width to height
    }

    @Test
    fun allAndroidLauncherAndSplashIconsExistWithExpectedDimensions() {
        val resDir = resolveResDir()
        val densities = mapOf(
            "mdpi" to (108 to 48),
            "hdpi" to (162 to 72),
            "xhdpi" to (216 to 96),
            "xxhdpi" to (324 to 144),
            "xxxhdpi" to (432 to 192),
        )

        densities.forEach { (density, sizes) ->
            val (fgSize, legacySize) = sizes
            val fgFile = File(resDir, "mipmap-$density/ic_launcher_foreground.png")
            val sqFile = File(resDir, "mipmap-$density/ic_launcher.png")
            val rndFile = File(resDir, "mipmap-$density/ic_launcher_round.png")

            assertTrue("Missing $fgFile", fgFile.isFile)
            assertTrue("Missing $sqFile", sqFile.isFile)
            assertTrue("Missing $rndFile", rndFile.isFile)

            assertEquals(fgSize to fgSize, readPngDimensions(fgFile))
            assertEquals(legacySize to legacySize, readPngDimensions(sqFile))
            assertEquals(legacySize to legacySize, readPngDimensions(rndFile))
        }

        val splashFile = File(resDir, "drawable-nodpi/splash_logo.png")
        assertTrue("Missing $splashFile", splashFile.isFile)
        assertEquals(288 to 288, readPngDimensions(splashFile))
    }

    @Test
    fun adaptiveIconXmlPointsToRadialBackgroundAndForeground() {
        val resDir = resolveResDir()
        val bgDrawable = File(resDir, "drawable/ic_launcher_background.xml")
        assertTrue("Missing radial background drawable", bgDrawable.isFile)

        listOf(
            File(resDir, "mipmap-anydpi-v26/ic_launcher.xml"),
            File(resDir, "mipmap-anydpi-v26/ic_launcher_round.xml"),
        ).forEach { xmlFile ->
            assertTrue("Missing $xmlFile", xmlFile.isFile)
            val content = xmlFile.readText()
            assertTrue(content.contains("@drawable/ic_launcher_background"))
            assertTrue(content.contains("@mipmap/ic_launcher_foreground"))
            assertFalse(content.contains("Version 2"))
        }
    }
}
